import { useState, useRef, useCallback } from "react";
import { SIMPLE_CONVERSATION_PROMPT } from "../../../server/prompts/simpleConversationPrompt";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";
type Lesson1Step = "NAME" | "FROM" | "LIVE" | "WORK" | "LIKE" | "DONE";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// ==========================================================
// 🔊 HELPER: TTS EXCLUSIVO PARA LESSON 2
// ==========================================================
async function speakWithTTS(text: string): Promise<void> {
  console.log(`🔊 [TTS] Speaking: "${text}"`);

  try {
    const response = await fetch("/api/tts/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: "nova",
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      throw new Error(`TTS request failed: ${response.statusText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        console.log(`✅ [TTS] Finished: "${text.substring(0, 20)}..."`);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch(reject);
    });
  } catch (error) {
    console.error("❌ [TTS] Error:", error);
    throw error;
  }
}

export function useRealtimeConversation({ lesson = 1, part = 1 } = {}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentStep] = useState<Lesson1Step>("NAME");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const currentQuestionIndexRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);

  // Estados para Lesson 2
  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);

  /* =====================================================
      HELPER: FORCE AI SPEECH (Utility para Lesson 1/General)
      (Conservado de tu código original)
  ===================================================== */
  const forceAISpeech = (textToSay: string) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") return;

    console.log(`🔵 [TITIRITERO] Ordenando: "${textToSay}"`);
    dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    dcRef.current.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
          instructions: `READ THIS EXACTLY: "${textToSay}"`,
          tool_choice: "none",
        },
      }),
    );
  };

  /* =====================================================
      HELPER: SPEAK LESSON 2 (Lógica Híbrida)
  ===================================================== */
  const speakLesson2TTS = useCallback(async (text: string) => {
    if (isTTSSpeakingRef.current) return;
    isTTSSpeakingRef.current = true;

    // UI Optimista (Assistant)
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: text,
        timestamp: Date.now(),
      },
    ]);

    try {
      await speakWithTTS(text);
    } catch (error) {
      console.error("❌ [TTS] Failed", error);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  }, []);

  const startConversation = async () => {
    try {
      setConnectionState("connecting");

      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lesson}&part=${part}`,
      );
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // =====================================================
      // CONFIGURACIÓN DE AUDIO (SEGURIDAD DE ESTADO)
      // =====================================================
      const audio = document.createElement("audio");
      audio.autoplay = true;

      if (lesson === 2) {
        // Lesson 2: Muteamos el canal de WebRTC (usamos TTS externo)
        audio.muted = true;
        console.log("🔇 [CONFIG] Audio Muted (Hybrid Mode)");
      } else {
        // Lesson 1: Aseguramos que NO esté muteado (Natural Mode)
        audio.muted = false;
      }

      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("✅ [DC] OPEN");
        setConnectionState("active");

        // =====================================================
        // 🟢 LECCIÓN 1: TU LÓGICA ORIGINAL (CON RESETS)
        // =====================================================
        if (lesson === 1) {
          const question1Text =
            "Hi, I'm your conversation partner. What is your name?";

          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                // Tu Prompt original
                instructions: `${SIMPLE_CONVERSATION_PROMPT} \n Ask: "${question1Text}"`,
                // RESET DE SEGURIDAD: Aseguramos que VAD esté prendido y voz por defecto
                turn_detection: { type: "server_vad" },
                voice: "shimmer",
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        }

        // =====================================================
        // 🔴 LECCIÓN 2: LÓGICA HÍBRIDA NUEVA
        // =====================================================
        if (lesson === 2) {
          currentQuestionIndexRef.current = 0;

          // Configuramos OpenAI como "Solo Transcriptor Pasivo"
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions:
                  "System: You are a passive transcriber. Do NOT speak.",
                tool_choice: "none",
                temperature: 0.6,
              },
            }),
          );

          const firstQuestion = LESSON_2_VOICE_MVP_QUESTIONS[0];
          setTimeout(() => {
            speakLesson2TTS(firstQuestion);
          }, 500);
        }
      };

      dc.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        // =====================================================
        // CANCELADOR DE REFLEJOS (SOLO LECCIÓN 2)
        // =====================================================
        if (lesson === 2) {
          if (
            data.type === "input_audio_buffer.speech_stopped" ||
            data.type === "response.created"
          ) {
            // Silenciamos a OpenAI si intenta hablar
            dc.send(JSON.stringify({ type: "response.cancel" }));
          }
        }

        // =====================================================
        // MANEJO DE TRANSCRIPCIÓN (AMBAS LECCIONES)
        // =====================================================
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();
          if (!userText) return;

          // --- RAMA LESSON 2 (DRILL) ---
          if (lesson === 2) {
            if (isTTSSpeakingRef.current) return;

            // Filtro Eco
            const currentQ =
              LESSON_2_VOICE_MVP_QUESTIONS[currentQuestionIndexRef.current];
            if (
              currentQ &&
              userText
                .toLowerCase()
                .includes(currentQ.toLowerCase().substring(0, 15))
            ) {
              return;
            }

            if (isProcessingRef.current) return;
            isProcessingRef.current = true;

            console.log(`👤 [USER L2] "${userText}"`);
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: userText,
                timestamp: Date.now(),
              },
            ]);

            const nextIndex = currentQuestionIndexRef.current + 1;
            currentQuestionIndexRef.current = nextIndex;
            const nextQuestion = LESSON_2_VOICE_MVP_QUESTIONS[nextIndex];

            setTimeout(() => {
              isProcessingRef.current = false;
              if (nextQuestion) {
                speakLesson2TTS(nextQuestion);
              }
            }, 500);
          }

          // --- RAMA LESSON 1 (NATURAL) ---
          // Aquí respetamos tu lógica original: Solo agregamos el mensaje del user
          // y dejamos que el VAD de OpenAI dispare la respuesta sola.
          else {
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: userText,
                timestamp: Date.now(),
              },
            ]);
          }
        }

        // =====================================================
        // VISUALIZACIÓN DE RESPUESTAS (SOLO LESSON 1)
        // =====================================================
        // En L2 usamos TTS externo, así que no miramos esto.
        if (lesson === 1 && data.type === "response.audio_transcript.done") {
          const aiText = data.transcript;
          if (aiText && aiText.trim() !== "") {
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                text: aiText,
                timestamp: Date.now(),
              },
            ]);
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
    }
  };

  const stopConversation = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
  };

  const requestSessionRecap = () => {
    if (lesson !== 2) {
      forceAISpeech(
        "Great job today! Keep practicing to improve your English.",
      );
    }
  };

  return {
    connectionState,
    errorMessage,
    messages,
    currentLesson: lesson,
    currentStep,
    startConversation,
    stopConversation,
    requestSessionRecap,
  };
}
