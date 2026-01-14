import { useState, useRef, useCallback, useEffect } from "react";
import { aiApi } from "../lib/api";
import { LESSONS_CONFIG } from "@/data/lesson" // Asegúrate de tener este archivo configurado

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// CACHÉ GLOBAL (Guarda audios de todas las lecciones: "L1-Q0", "L3-Q5")
const audioCache = new Map<string, Blob>();

export function useGenericDrill(lessonId: number) {
  // 1. CARGAMOS LA CONFIGURACIÓN SEGÚN EL ID
  const config = LESSONS_CONFIG[lessonId];

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  // Refs de WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Estado de la sesión
  const currentQuestionIndexRef = useRef<number>(0);
  const sessionMistakesRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string | null>(null);

  // Flags de control
  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);
  const timingRef = useRef<{ stopSpeaking: number }>({ stopSpeaking: 0 });

  // --------------------------------------------------------------------------
  // HELPER: Reproductor de Audio
  // --------------------------------------------------------------------------
  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text, timestamp: Date.now() }]);
  };

  const playAudioBlob = (blob: Blob): Promise<void> => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return new Promise<void>((resolve) => {
      audio.onended = () => { resolve(); URL.revokeObjectURL(url); };
      audio.play().catch((e) => console.error("🔊 [Audio Error]:", e));
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
      await playAudioBlob(blob);
    } catch (e) {
      console.error("❌ [TTS Error]", e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  // --------------------------------------------------------------------------
  // LOGIC: Speak Question (Maneja el caso de Lesson 3 automáticamente)
  // --------------------------------------------------------------------------
  const speakQuestionByIndex = async (index: number) => {
    if (!config) return;
    if (isTTSSpeakingRef.current) return;

    const rawText = config.questions[index];
    if (!rawText) return;

    // 🛡️ LIMPIEZA UNIVERSAL:
    // Si hay paréntesis (Lesson 3), los quita del audio.
    // Si no hay (Lesson 1 y 2), deja el texto igual.
    const textToSpeak = rawText.replace(/\s*\(.*?\)\s*/g, "");

    // Mostramos el texto completo (con pista si existe) en el chat
    addMessage("assistant", rawText);
    isTTSSpeakingRef.current = true;

    const cacheKey = `L${lessonId}-Q${index}`;

    try {
      let blob = audioCache.get(cacheKey);
      if (!blob) {
        console.log(`🐢 [CACHE MISS] Downloading ${cacheKey}...`);
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToSpeak, voice: "nova", speed: 1.0 }),
        });
        blob = await response.blob();
        audioCache.set(cacheKey, blob);
      } else {
        console.log(`⚡ [CACHE HIT] ${cacheKey}`);
      }
      await playAudioBlob(blob);
    } catch (e) {
      console.error("❌ [TTS Error]", e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  const prefetchNextQuestion = async (currentIndex: number) => {
    if (!config) return;
    const nextIdx = currentIndex + 1;
    const cacheKey = `L${lessonId}-Q${nextIdx}`;

    if (nextIdx >= config.questions.length || audioCache.has(cacheKey)) return;

    try {
      const rawText = config.questions[nextIdx];
      const textToSpeak = rawText.replace(/\s*\(.*?\)\s*/g, ""); // Misma limpieza
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, voice: "nova", speed: 1.0 }),
      });
      const blob = await response.blob();
      audioCache.set(cacheKey, blob);
    } catch (e) {
      console.warn("⚠️ [Prefetch Warning]", e);
    }
  };

  // --------------------------------------------------------------------------
  // WEBRTC CONNECTION
  // --------------------------------------------------------------------------
  const startConversation = useCallback(async () => {
    if (!config) {
      setErrorMessage("Lesson config not found for ID " + lessonId);
      return;
    }

    try {
      setConnectionState("connecting");
      setMessages([]);
      setIsThinking(false);
      setErrorMessage("");
      sessionMistakesRef.current.clear();
      currentQuestionIndexRef.current = 0; // Siempre empieza en 0 al iniciar

      // 1. Pedir Token con el lessonId dinámico
      const tokenRes = await fetch(`/api/assistant/simple-session?lesson=${lessonId}`);
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      // 2. Setup WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true"); // Importante para iOS
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        setConnectionState("active");
        dc.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: "System: You are a passive transcriber. Listen and transcribe. Do NOT speak.",
            tool_choice: "none",
            temperature: 0.6,
          },
        }));

        setTimeout(() => {
          speakQuestionByIndex(0);
          prefetchNextQuestion(0);
        }, 500);
      };

      dc.onmessage = async (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.type === "input_audio_buffer.speech_started") {
          prefetchNextQuestion(currentQuestionIndexRef.current);
        }

        if (data.type === "input_audio_buffer.speech_stopped") {
          timingRef.current.stopSpeaking = performance.now();
          dc.send(JSON.stringify({ type: "response.cancel" }));
        }

        if (data.type === "conversation.item.input_audio_transcription.completed") {
          const userText = data.transcript.trim();
          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current) return;

          const currentQ = config.questions[currentQuestionIndexRef.current];
          
          // Filtro de Eco Básico
          if (currentQ && userText.toLowerCase().includes(currentQ.toLowerCase().substring(0, 15))) return;

          isProcessingRef.current = true;
          addMessage("user", userText);
          setIsThinking(true);

          try {
            // Enviamos el lessonId dinámico al backend
            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: lessonId, 
            });

            if (analysisResult.tutorInstruction) {
              await speakDynamicText(analysisResult.tutorInstruction);
            }

            if (analysisResult.decision === "correct_and_retry") {
              if (currentQ) sessionMistakesRef.current.add(currentQ);
            }

            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;
              if (nextIdx < config.questions.length) {
                currentQuestionIndexRef.current = nextIdx;
                await speakQuestionByIndex(nextIdx);
              } else {
                handleLessonEnd();
              }
            }
          } catch (error) {
            console.error("❌ [Eval Error]", error);
          } finally {
            isProcessingRef.current = false;
            setIsThinking(false);
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
        method: "POST",
        headers: { Authorization: `Bearer ${response.token}`, "Content-Type": "application/sdp", "OpenAI-Beta": "realtime=v1" },
        body: offer.sdp,
      });
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
    } catch (err: any) {
      console.error("❌ [Connection Failed]", err);
      setErrorMessage("Connection failed: " + err.message);
      setConnectionState("error");
    }
  }, [lessonId, config]); // Recrear si cambia la lección

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------
  const handleLessonEnd = async () => {
    const mistakes = Array.from(sessionMistakesRef.current);
    let finalMsg = "Great job! You finished the lesson.";

    if (mistakes.length > 0) {
      // Limpieza cosmética básica (igual que en tus archivos viejos)
      const reviewList = mistakes
        .map((m) => m.replace(/How do you say|in English\?/gi, "").replace(/[¿?()]/g, "").trim())
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

  useEffect(() => {
    return () => stopConversation();
  }, [stopConversation]);

  return { connectionState, errorMessage, messages, isThinking, startConversation, stopConversation };
}