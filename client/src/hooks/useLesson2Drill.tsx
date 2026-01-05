import { useState, useRef, useCallback } from "react";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";
import { aiApi } from "../lib/api";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// 🚀 CACHÉ GLOBAL (Persiste entre renderizados)
const audioCache = new Map<number, Blob>();

export function useLesson2Drill({ part = 1 } = {}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const messagesRef = useRef<ConversationMessage[]>([]);
  const currentQuestionIndexRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);

  // CRONÓMETRO DE DEBUG
  const timingRef = useRef<{ stopSpeaking: number }>({ stopSpeaking: 0 });

  const addMessage = (role: "user" | "assistant", text: string) => {
    const newMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role,
      text,
      timestamp: Date.now(),
    };
    messagesRef.current = [...messagesRef.current, newMsg];
    setMessages((prev) => [...prev, newMsg]);
  };

  // --- LÓGICA DE AUDIO OPTIMIZADA ---

  const playAudioBlob = (blob: Blob, label: string): Promise<void> => {
    const startPlay = performance.now();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return new Promise<void>((resolve) => {
      audio.onended = () => {
        resolve();
        URL.revokeObjectURL(url);
      };
      audio.onplay = () => {
        console.log(
          `🔊 [AUDIO PLAY] ${label} started. Latency from play call: ${(performance.now() - startPlay).toFixed(0)}ms`,
        );
      };
      audio.play().catch((e) => console.error("Error playing audio:", e));
    });
  };

  // 1. Hablar Feedback Dinámico (No cacheable)
  const speakDynamicText = async (text: string) => {
    if (isTTSSpeakingRef.current) return;
    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;
    try {
      const t0 = performance.now();
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      const t1 = performance.now();
      console.log(`⬇️ [TTS DOWNLOAD] Feedback took ${(t1 - t0).toFixed(0)}ms`);

      if (!response.ok) throw new Error("TTS Failed");
      const blob = await response.blob();
      await playAudioBlob(blob, "Dynamic Feedback");
    } catch (e) {
      console.error(e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  // 2. Hablar Pregunta (Cacheable)
  const speakQuestionByIndex = async (index: number) => {
    if (isTTSSpeakingRef.current) return;
    const text = LESSON_2_VOICE_MVP_QUESTIONS[index];
    if (!text) return;

    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;

    try {
      let blob = audioCache.get(index);
      if (blob) {
        console.log(`⚡ [CACHE HIT] Q${index} ready immediately.`);
        await playAudioBlob(blob, `Question ${index}`);
      } else {
        console.log(`🐢 [CACHE MISS] Downloading Q${index}...`);
        const t0 = performance.now();
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
        });
        const t1 = performance.now();
        console.log(
          `⬇️ [TTS DOWNLOAD] Q${index} took ${(t1 - t0).toFixed(0)}ms`,
        );

        if (!response.ok) throw new Error("TTS Failed");
        blob = await response.blob();
        audioCache.set(index, blob);
        await playAudioBlob(blob, `Question ${index}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  // 3. Pre-fetch (Segundo plano)
  const prefetchNextQuestion = async (currentIndex: number) => {
    const nextIdx = currentIndex + 1;
    if (
      nextIdx >= LESSON_2_VOICE_MVP_QUESTIONS.length ||
      audioCache.has(nextIdx)
    )
      return;

    console.log(`🚀 [PREFETCH START] Q${nextIdx}`);
    try {
      const text = LESSON_2_VOICE_MVP_QUESTIONS[nextIdx];
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      if (response.ok) {
        const blob = await response.blob();
        audioCache.set(nextIdx, blob);
        console.log(`🏁 [PREFETCH DONE] Q${nextIdx} cached.`);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // --- FIN LÓGICA AUDIO ---

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setMessages([]);
      messagesRef.current = [];
      currentQuestionIndexRef.current = 0;
      setIsThinking(false);
      audioCache.clear(); // Limpiamos caché por seguridad al iniciar

      // Pedimos sesión para Lesson 2
      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=2&part=${part}`,
      );
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.muted = true;
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("[L2] Drill Started");
        setConnectionState("active");

        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions:
                "System: You are a passive transcriber. Listen and transcribe. Do NOT speak.",
              tool_choice: "none",
              temperature: 0.6,
            },
          }),
        );

        // Iniciar flujo: Hablar Q0 y bajar Q1
        const firstQ = LESSON_2_VOICE_MVP_QUESTIONS[0];
        if (firstQ) {
          setTimeout(() => {
            speakQuestionByIndex(0);
            prefetchNextQuestion(0);
          }, 500);
        }
      };

      dc.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // 1. EVENTO CLAVE: Usuario empieza a hablar -> Disparar prefetch
        if (data.type === "input_audio_buffer.speech_started") {
          console.log("🎤 [USER START SPEAKING]");
          prefetchNextQuestion(currentQuestionIndexRef.current);
          return;
        }

        if (data.type === "input_audio_buffer.speech_stopped") {
          timingRef.current.stopSpeaking = performance.now();
          console.log("🛑 [USER STOP SPEAKING]");
          dc.send(JSON.stringify({ type: "response.cancel" }));
        }

        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();
          const tTranscript = performance.now();
          console.log(
            `📝 [TRANSCRIPT] "${userText}" (+${(tTranscript - timingRef.current.stopSpeaking).toFixed(0)}ms)`,
          );

          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current)
            return;

          const currentQ =
            LESSON_2_VOICE_MVP_QUESTIONS[currentQuestionIndexRef.current];
          if (
            currentQ &&
            userText
              .toLowerCase()
              .includes(currentQ.toLowerCase().substring(0, 10))
          ) {
            return;
          }

          isProcessingRef.current = true;
          addMessage("user", userText);
          setIsThinking(true);

          try {
            console.log("🧠 [AGENTS] Analyzing...");
            const tStartAnalysis = performance.now();

            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: 2,
            });

            console.log(
              `🧠 [AGENTS DONE] Took ${(performance.now() - tStartAnalysis).toFixed(0)}ms`,
            );

            // Si hay instrucción (feedback/corrección), la decimos.
            // NOTA: Si es correcta, el backend devuelve "" (vacío), así que esto se salta.
            if (analysisResult.tutorInstruction) {
              await speakDynamicText(analysisResult.tutorInstruction);
            }

            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;
              if (nextIdx < LESSON_2_VOICE_MVP_QUESTIONS.length) {
                currentQuestionIndexRef.current = nextIdx;
                // Reproducir desde caché (instantáneo)
                await speakQuestionByIndex(nextIdx);
              } else {
                await speakDynamicText(
                  "¡Excelente! Hemos terminado el ejercicio.",
                );
                stopConversation();
              }
            } else {
              console.log("[Analysis] Retry same question");
            }
          } catch (error) {
            console.error("Analysis Error:", error);
            // Fallback en caso de error
            const nextIdx = currentQuestionIndexRef.current + 1;
            if (nextIdx < LESSON_2_VOICE_MVP_QUESTIONS.length) {
              currentQuestionIndexRef.current = nextIdx;
              speakQuestionByIndex(nextIdx);
            }
          } finally {
            isProcessingRef.current = false;
            setIsThinking(false);
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${response.token}`,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
          body: offer.sdp,
        },
      );
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpRes.text(),
      });
    } catch (err) {
      console.error(err);
      setErrorMessage("Error al iniciar");
      setConnectionState("error");
      setIsThinking(false);
    }
  };

  const stopConversation = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
    setIsThinking(false);
  };

  return {
    connectionState,
    errorMessage,
    messages,
    isThinking,
    startConversation,
    stopConversation,
  };
}
