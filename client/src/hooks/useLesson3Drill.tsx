import { useState, useRef } from "react";
import { aiApi } from "../lib/api";

// ✅ IMPORTAMOS LAS PREGUNTAS DESDE EL SERVIDOR
import { LESSON_3_QUESTIONS } from "../../../server/prompts/Lesson3Questions";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// CACHÉ GLOBAL
const audioCache = new Map<number, Blob>();

// 🛠️ DEV TOOL: Leer índice desde la URL
const getStartIndex = () => {
  if (typeof window === "undefined") return 0;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const idx = q ? parseInt(q, 10) : 0;
  return isNaN(idx) ? 0 : idx;
};

export function useLesson3Drill({ part = 1 } = {}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const currentQuestionIndexRef = useRef<number>(getStartIndex());
  const sessionMistakesRef = useRef<Set<string>>(new Set());

  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);

  const timingRef = useRef<{ stopSpeaking: number }>({ stopSpeaking: 0 });

  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, text, timestamp: Date.now() },
    ]);
  };

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

  const speakDynamicText = async (text: string) => {
    if (isTTSSpeakingRef.current) return;
    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;
    try {
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      const blob = await response.blob();
      await playAudioBlob(blob, "Dynamic Feedback");
    } catch (e) {
      console.error(e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  const speakQuestionByIndex = async (index: number) => {
    if (isTTSSpeakingRef.current) return;

    // Usamos la lista importada
    const rawText = LESSON_3_QUESTIONS[index];
    if (!rawText) return;

    // 1. TEXTO LIMPIO PARA EL AUDIO (Sin paréntesis)
    // El robot dice: "How many spoons?"
    const textToSpeak = rawText.replace(/\s*\(.*?\)\s*/g, "");

    // 2. TEXTO RAW PARA EL CHAT (Con paréntesis)
    // El usuario ve: "How many spoons? (24)"
    addMessage("assistant", rawText);
    
    isTTSSpeakingRef.current = true;

    try {
      let blob = audioCache.get(index);
      if (blob) {
        console.log(`⚡ [CACHE HIT] Q${index} ready immediately.`);
        await playAudioBlob(blob, `Question ${index}`);
      } else {
        console.log(`🐢 [CACHE MISS] Downloading Q${index}...`);
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // ⚠️ ALERTA: Enviamos 'textToSpeak' (limpio) al TTS
          body: JSON.stringify({ text: textToSpeak, voice: "nova", speed: 1.0 }),
        });
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

  const prefetchNextQuestion = async (currentIndex: number) => {
    const nextIdx = currentIndex + 1;
    if (
      nextIdx >= LESSON_3_QUESTIONS.length ||
      audioCache.has(nextIdx)
    )
      return;

    try {
      const rawText = LESSON_3_QUESTIONS[nextIdx];
      // Aquí también limpiamos para guardar el audio limpio en caché
      const textToSpeak = rawText.replace(/\s*\(.*?\)\s*/g, "");
      
      await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, voice: "nova", speed: 1.0 }),
      })
        .then((res) => res.blob())
        .then((blob) => {
          audioCache.set(nextIdx, blob);
        });
    } catch (e) {
      console.warn(e);
    }
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setMessages([]);
      setIsThinking(false);

      audioCache.clear();
      sessionMistakesRef.current.clear();

      // Pedimos sesión para lesson=3
      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=3&part=${part}`,
      );
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");

      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
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

        setTimeout(() => {
          const startIdx = currentQuestionIndexRef.current;
          console.log(`🚀 [START L3] Starting at index: ${startIdx}`);
          speakQuestionByIndex(startIdx);
          prefetchNextQuestion(startIdx);
        }, 500);
      };

      dc.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type === "input_audio_buffer.speech_started") {
          prefetchNextQuestion(currentQuestionIndexRef.current);
          return;
        }

        if (data.type === "input_audio_buffer.speech_stopped") {
          timingRef.current.stopSpeaking = performance.now();
          dc.send(JSON.stringify({ type: "response.cancel" }));
        }

        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();
          
          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current)
            return;

          const currentQ = LESSON_3_QUESTIONS[currentQuestionIndexRef.current];
          
          // Ignorar eco
          if (
            currentQ &&
            userText
              .toLowerCase()
              .includes(currentQ.toLowerCase().substring(0, 15))
          )
            return;

          isProcessingRef.current = true;
          addMessage("user", userText);
          setIsThinking(true);

          try {
            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: 3,
            });

            if (analysisResult.tutorInstruction) {
              await speakDynamicText(analysisResult.tutorInstruction);
            }

            if (analysisResult.decision === "correct_and_retry") {
              if (currentQ) {
                sessionMistakesRef.current.add(currentQ);
              }
            }

            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;

              if (nextIdx < LESSON_3_QUESTIONS.length) {
                currentQuestionIndexRef.current = nextIdx;
                await speakQuestionByIndex(nextIdx);
              } else {
                // FIN DE LA LECCIÓN
                const mistakes = Array.from(sessionMistakesRef.current);
                let finalMsg =
                  "¡Excelente sesión! Has completado todo el ejercicio con éxito.";

                if (mistakes.length > 0) {
                  const topicsToReview = mistakes
                    .map((m) => {
                      return m
                        .replace(/How do you say/gi, "")
                        .replace(/in English\?/gi, "")
                        .replace(/What is/gi, "")
                        .replace("Say:", "")
                        .replace(/[¿?]/g, "")
                        .trim();
                    })
                    .slice(0, 3);
                  
                  finalMsg = `¡Muy buen trabajo! Terminamos por hoy. Solo te sugiero repasar estas expresiones: ${topicsToReview.join(", ")}.`;
                }

                await speakDynamicText(finalMsg);
                stopConversation();
              }
            }
          } catch (error) {
            console.error("Analysis Error:", error);
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
      setConnectionState("error");
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