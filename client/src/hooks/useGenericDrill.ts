import { useState, useRef, useCallback, useEffect } from "react";
import { aiApi } from "../lib/api";
import { LESSONS_CONFIG } from "@/data/lesson";

// TIPOS
type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// CACHÉ GLOBAL (Fuera del hook para que persista si desmontas y montas rápido)
const audioCache = new Map<string, Blob>(); // Clave: "lessonId-questionIndex"

export function useGenericDrill(lessonId: number) {
  // 1. CARGA DE CONFIGURACIÓN
  const config = LESSONS_CONFIG[lessonId];

  // 2. ESTADOS
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  // 3. REFERENCIAS
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Estado mutable del Drill
  const currentQuestionIndexRef = useRef<number>(0);
  const sessionMistakesRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string | null>(null);

  // Flags de control
  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);
  const timingRef = useRef<{ stopSpeaking: number }>({ stopSpeaking: 0 });

  // -------------------------------------------------------------------
  // HELPERS (Audio, TTS, Mensajes)
  // -------------------------------------------------------------------

  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, text, timestamp: Date.now() },
    ]);
  };

  const playAudioBlob = (blob: Blob, label: string): Promise<void> => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return new Promise<void>((resolve) => {
      audio.onended = () => {
        resolve();
        URL.revokeObjectURL(url);
      };
      audio.play().catch((e) => console.error("Error playing audio:", e));
    });
  };

  // TTS DINÁMICO (Feedback del Tutor)
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

  // TTS DE PREGUNTAS (Con Caché y Clave única por lección)
  const speakQuestionByIndex = async (index: number) => {
    if (!config) return;
    if (isTTSSpeakingRef.current) return;

    const text = config.questions[index]; // 👈 Usamos las preguntas de la config
    if (!text) return;

    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;

    // Clave única para el caché: "1-0" (Lección 1, Pregunta 0)
    const cacheKey = `${lessonId}-${index}`;

    try {
      let blob = audioCache.get(cacheKey);
      if (blob) {
        console.log(`⚡ [CACHE HIT] ${cacheKey} ready.`);
        await playAudioBlob(blob, `Question ${index}`);
      } else {
        console.log(`🐢 [CACHE MISS] Downloading ${cacheKey}...`);
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
        });
        blob = await response.blob();
        audioCache.set(cacheKey, blob);
        await playAudioBlob(blob, `Question ${index}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  // PREFETCH (Carga la siguiente pregunta en background)
  const prefetchNextQuestion = async (currentIndex: number) => {
    if (!config) return;
    const nextIdx = currentIndex + 1;
    const cacheKey = `${lessonId}-${nextIdx}`;

    if (nextIdx >= config.questions.length || audioCache.has(cacheKey)) return;

    try {
      const text = config.questions[nextIdx];
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      const blob = await response.blob();
      audioCache.set(cacheKey, blob);
      console.log(`🏁 [PREFETCH DONE] ${cacheKey} cached.`);
    } catch (e) {
      console.warn(e);
    }
  };

  // -------------------------------------------------------------------
  // CORE: START CONVERSATION
  // -------------------------------------------------------------------
  const startConversation = useCallback(async () => {
    if (!config) {
      setErrorMessage("Lesson config not found");
      return;
    }

    try {
      setConnectionState("connecting");
      setMessages([]);
      setIsThinking(false);
      setErrorMessage("");

      // Reset de estado local
      sessionMistakesRef.current.clear();
      currentQuestionIndexRef.current = 0; // O leer de URL si quieres restaurar esa feature

      // 1. Obtener Token (Tu endpoint actual)
      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lessonId}`,
      );
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      // 2. Setup WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Audio Element (HTML)
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true"); // Fix iOS
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      // Micrófono
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Data Channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      // ---------------------------------------------------------------
      // 🔥 EVENTO: CONEXIÓN ABIERTA
      // ---------------------------------------------------------------
      dc.onopen = () => {
        setConnectionState("active");

        // Enviamos la configuración ESPECÍFICA de esta lección
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              // 👇 AQUÍ SE INYECTA EL SYSTEM PROMPT DE lessons.ts
              instructions: config.systemPrompt,
              tool_choice: "none",
              temperature: 0.6,
              voice: "shimmer", // Aseguramos voz consistente
              input_audio_transcription: { model: "whisper-1" },
            },
          }),
        );

        // Iniciar el Drill con la primera pregunta
        setTimeout(() => {
          console.log(`🚀 [START] Lesson ${lessonId} - "${config.title}"`);
          speakQuestionByIndex(0);
          prefetchNextQuestion(0);
        }, 500);
      };

      // ---------------------------------------------------------------
      // 🔥 EVENTO: MENSAJES DEL DATA CHANNEL
      // ---------------------------------------------------------------
      dc.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // A. Usuario empieza a hablar
        if (data.type === "input_audio_buffer.speech_started") {
          console.log("🎤 [USER START]");
          prefetchNextQuestion(currentQuestionIndexRef.current);
          return;
        }

        // B. Usuario deja de hablar
        if (data.type === "input_audio_buffer.speech_stopped") {
          timingRef.current.stopSpeaking = performance.now();
          console.log("🛑 [USER STOP]");
          dc.send(JSON.stringify({ type: "response.cancel" })); // Cancelamos respuesta automática de OpenAI
        }

        // C. Transcripción lista (WHISPER)
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();
          console.log(`📝 [TRANSCRIPT] "${userText}"`);

          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current)
            return;

          const currentQ = config.questions[currentQuestionIndexRef.current];

          // Filtro anti-eco (Si el usuario repite la pregunta exacta)
          if (
            currentQ &&
            userText
              .toLowerCase()
              .includes(currentQ.toLowerCase().substring(0, 15))
          ) {
            return;
          }

          // --- INICIO EVALUACIÓN BACKEND ---
          isProcessingRef.current = true;
          addMessage("user", userText);
          setIsThinking(true);

          try {
            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: lessonId, // 👈 Pasamos el ID dinámico
            });

            // Feedback Auditivo (Si el tutor quiere corregir)
            if (analysisResult.tutorInstruction) {
              await speakDynamicText(analysisResult.tutorInstruction);
            }

            // Guardar Error
            if (analysisResult.decision === "correct_and_retry") {
              if (currentQ) sessionMistakesRef.current.add(currentQ);
            }

            // Avanzar Pregunta
            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;
              if (nextIdx < config.questions.length) {
                currentQuestionIndexRef.current = nextIdx;
                await speakQuestionByIndex(nextIdx);
              } else {
                // FIN DE LA LECCIÓN
                handleLessonEnd();
              }
            }
          } catch (error) {
            console.error("Eval Error:", error);
          } finally {
            isProcessingRef.current = false;
            setIsThinking(false);
          }
        }
      };

      // 3. Negociación SDP
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
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Connection failed: " + err.message);
      setConnectionState("error");
    }
  }, [lessonId, config]); // Se recrea si cambia la lección

  // Manejo del Fin de Lección
  const handleLessonEnd = async () => {
    const mistakes = Array.from(sessionMistakesRef.current);
    let finalMsg = "Great job! You finished the lesson perfectly.";

    if (mistakes.length > 0) {
      // Limpieza simple de textos de preguntas para que suene natural
      const reviewList = mistakes
        .map((m) => m.replace(/How do you say|in English\?/gi, "").trim())
        .slice(0, 3);
      finalMsg = `Good practice! Try to review these words: ${reviewList.join(", ")}.`;
    }

    await speakDynamicText(finalMsg);
    stopConversation();
  };

  const stopConversation = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
    setIsThinking(false);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => stopConversation();
  }, [stopConversation]);

  return {
    connectionState,
    errorMessage,
    messages,
    isThinking,
    startConversation,
    stopConversation,
  };
}
