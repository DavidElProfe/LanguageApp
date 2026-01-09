import { useState, useRef, useCallback } from "react";
// ✅ IMPORT CORREGIDO
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";
import { aiApi } from "../lib/api";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// CACHÉ GLOBAL
const audioCache = new Map<number, Blob>();

// 🛠️ DEV TOOL: Función para leer el índice desde la URL
// Ejemplo: .../?lesson=2&q=5  -> Arranca en la pregunta 6
const getStartIndex = () => {
  if (typeof window === "undefined") return 0;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const idx = q ? parseInt(q, 10) : 0;
  return isNaN(idx) ? 0 : idx;
};

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

  // 🛠️ INICIALIZAMOS CON EL VALOR DE LA URL
  const currentQuestionIndexRef = useRef<number>(getStartIndex());

  // 📝 1. LIBRETA DE ERRORES (Set para evitar duplicados)
  const sessionMistakesRef = useRef<Set<string>>(new Set());

  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);

  // CRONÓMETRO DE DEBUG
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
      const t0 = performance.now();
      console.log(`REQUESTING DYNAMIC TTS...`);
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      const t1 = performance.now();
      console.log(`⬇️ [TTS DOWNLOAD] Took ${(t1 - t0).toFixed(0)}ms`);

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

    // ✅ USAMOS LA LISTA CORRECTA
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
        console.log(`⬇️ [TTS DOWNLOAD] Took ${(t1 - t0).toFixed(0)}ms`);
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
    // ✅ USAMOS LA LISTA CORRECTA
    if (
      nextIdx >= LESSON_2_VOICE_MVP_QUESTIONS.length ||
      audioCache.has(nextIdx)
    )
      return;

    console.log(`🚀 [PREFETCH START] Q${nextIdx}`);
    try {
      const text = LESSON_2_VOICE_MVP_QUESTIONS[nextIdx];
      await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      })
        .then((res) => res.blob())
        .then((blob) => {
          audioCache.set(nextIdx, blob);
          console.log(`🏁 [PREFETCH DONE] Q${nextIdx} cached.`);
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

      // Limpiamos caché (excepto si queremos mantener estado, pero mejor limpiar para evitar bugs)
      audioCache.clear();
      sessionMistakesRef.current.clear(); // Limpiamos libreta de errores

      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=2&part=${part}`,
      );
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;

      // 📱 FIX PARA MÓVILES: playsinline evita pantalla negra/bloqueos en iOS
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");

      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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

        // 🛠️ USAMOS EL ÍNDICE REF (que puede venir de la URL)
        setTimeout(() => {
          const startIdx = currentQuestionIndexRef.current;
          console.log(`🚀 [START L2] Starting at index: ${startIdx}`);
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
          console.log("🎤 [USER START SPEAKING]");
          prefetchNextQuestion(currentQuestionIndexRef.current);
          return;
        }

        if (data.type === "input_audio_buffer.speech_stopped") {
          timingRef.current.stopSpeaking = performance.now();
          console.log("🛑 [USER STOP SPEAKING] Waiting for transcript...");
          dc.send(JSON.stringify({ type: "response.cancel" }));
        }

        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();
          const tTranscript = performance.now();
          console.log(
            `📝 [TRANSCRIPT READY] "${userText}" (+${(tTranscript - timingRef.current.stopSpeaking).toFixed(0)}ms from stop)`,
          );

          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current)
            return;

          // ✅ USAMOS LA LISTA CORRECTA
          const currentQ =
            LESSON_2_VOICE_MVP_QUESTIONS[currentQuestionIndexRef.current];
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
            console.log("🧠 [AGENTS START] Sending to backend...");
            const tStartAnalysis = performance.now();

            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: 2,
            });

            const tEndAnalysis = performance.now();
            console.log(
              `🧠 [AGENTS END] Took ${(tEndAnalysis - tStartAnalysis).toFixed(0)}ms`,
            );

            if (analysisResult.tutorInstruction) {
              console.log("🗣️ [FEEDBACK] Playing correction...");
              await speakDynamicText(analysisResult.tutorInstruction);
            }

            // 📝 2. SI HAY ERROR, LO GUARDAMOS
            if (analysisResult.decision === "correct_and_retry") {
              if (currentQ) {
                sessionMistakesRef.current.add(currentQ);
                console.log(`📝 [MISTAKE LOGGED] Added: "${currentQ}"`);
                console.log(
                  "📉 [CURRENT MISTAKES LIST]:",
                  Array.from(sessionMistakesRef.current),
                );
              }
            }

            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;

              // ✅ USAMOS LA LISTA CORRECTA
              if (nextIdx < LESSON_2_VOICE_MVP_QUESTIONS.length) {
                currentQuestionIndexRef.current = nextIdx;
                console.log("⏩ [ADVANCE] Playing next question...");
                await speakQuestionByIndex(nextIdx);
              } else {
                // 📝 3. FIN DE LECCIÓN: FEEDBACK SUAVE Y PEDAGÓGICO
                const mistakes = Array.from(sessionMistakesRef.current);
                let finalMsg =
                  "¡Excelente sesión! Has completado todo el ejercicio con éxito.";

                if (mistakes.length > 0) {
                  // Limpieza cosmética para que suene natural
                  const topicsToReview = mistakes
                    .map((m) => {
                      // Quitamos el "Say:" o signos para que quede solo la frase/concepto
                      return m
                        .replace(/How do you say/gi, "")
                        .replace(/in English\?/gi, "")
                        .replace(/What is/gi, "")
                        .replace("Say:", "")
                        .replace(/[¿?]/g, "") // Quita signos de interrogación
                        .trim();
                    })
                    .slice(0, 3); // Máximo 3 para no saturar

                  // 💡 NUEVO GUIÓN: Más constructivo, menos "acusador"
                  finalMsg = `¡Muy buen trabajo! Terminamos por hoy. Solo te sugiero repasar estas expresiones: ${topicsToReview.join(", ")}.`;
                }

                console.log("🏁 [FINISH] " + finalMsg);
                await speakDynamicText(finalMsg);
                stopConversation();
              }
            }
          } catch (error) {
            console.error("Analysis Error:", error);
          } finally {
            isProcessingRef.current = false;
            setIsThinking(false);
            console.log(
              `🏁 [TURN COMPLETED] Total time: ${(performance.now() - timingRef.current.stopSpeaking).toFixed(0)}ms`,
            );
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
