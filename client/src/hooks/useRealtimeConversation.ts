import { useState, useRef } from "react";
import { SIMPLE_CONVERSATION_PROMPT } from "../../../server/prompts/simpleConversationPrompt";
// Nota: LESSON_2_VOICE_MVP_PROMPT ya no se usa dinámicamente, se define en el backend.
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";

/* =====================================================
    TYPES & CONSTANTS
===================================================== */
type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";
type Lesson1Step = "NAME" | "FROM" | "LIVE" | "WORK" | "LIKE" | "DONE";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

/* =====================================================
    HOOK: useRealtimeConversation
===================================================== */

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

  /* =====================================================
      HELPER: SEND COMMAND TO AI (TITIRITERO)
  ===================================================== */
  // Esta función obliga a la IA a decir un texto específico
  const forceAISpeech = (textToSay: string) => {
    if (dcRef.current?.readyState !== "open") return;

    // 1. Inyectamos el mensaje en el historial de la conversación como si la IA lo hubiera pensado
    dcRef.current.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: textToSay,
            },
          ],
        },
      }),
    );

    // 2. Le ordenamos que genere el audio de ese mensaje
    dcRef.current.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: `Say exactly: "${textToSay}". Do not add anything else.`,
        },
      }),
    );
  };

  /* =====================================================
      START CONVERSATION
  ===================================================== */

  const startConversation = async () => {
    try {
      setConnectionState("connecting");

      // 1. Obtenemos Token y Session ID (El backend configura las Tools aquí)
      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lesson}&part=${part}`,
      );
      const response = await tokenRes.json();

      sessionIdRef.current = response.sessionId;

      // 2. Setup WebRTC Standard
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      // 3. Manejo de Eventos (La parte crítica)
      dc.onopen = () => {
        console.log("[DC] open");
        setConnectionState("active");

        /* ---------------- LESSON 1 (Lógica original) ---------------- */
        if (lesson === 1) {
          const question1Text =
            "Hi, I'm your conversation partner from The Language School. What is your name?";
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: `
${SIMPLE_CONVERSATION_PROMPT}
CRITICAL: Ask EXACTLY: "${question1Text}"
Wait for the student's response.
                `,
                tool_choice: "none",
                temperature: 0.6,
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        }

        /* ---------------- LESSON 2 (NUEVA LÓGICA TOOLS) ---------------- */
        if (lesson === 2) {
          currentQuestionIndexRef.current = 0;
          const firstQuestion = LESSON_2_VOICE_MVP_QUESTIONS[0];

          // Disparamos manualmente la primera pregunta para iniciar el bucle
          console.log("[L2] Starting Drill with:", firstQuestion);
          forceAISpeech(firstQuestion);
        }
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);

        /* ---------------- A. MANEJO DE TOOLS (Lesson 2) ---------------- */
        if (data.type === "response.function_call_arguments.done") {
          const toolName = data.name;
          const args = JSON.parse(data.arguments);

          if (toolName === "ignore_noise") {
            console.log("🔇 [AI] Ignorando ruido/silencio.");
            // No hacemos NADA. La IA se queda callada.
          }

          if (toolName === "process_student_answer") {
            const transcript = args.transcript;
            console.log("🎤 [AI TOOL] Procesando respuesta:", transcript);

            // Agregar mensaje del usuario al chat visual
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: transcript,
                timestamp: Date.now(),
              },
            ]);

            // --- LÓGICA DE CONTROL DE FLUJO ---
            // Aquí decides si la respuesta fue correcta o no.
            // Por ahora, asumimos que siempre avanza (MVP).
            const nextIndex = currentQuestionIndexRef.current + 1;
            currentQuestionIndexRef.current = nextIndex;

            const nextQuestion = LESSON_2_VOICE_MVP_QUESTIONS[nextIndex];

            if (nextQuestion) {
              // Feedback + Siguiente Pregunta
              const feedbackText = `Good. Next: ${nextQuestion}`;
              forceAISpeech(feedbackText);
            } else {
              // Fin de la lección
              forceAISpeech("Excellent work. We have finished the lesson.");
            }
          }
        }

        /* ---------------- B. VISUALIZACIÓN (Lesson 1 y 2) ---------------- */
        // Nota: En Lesson 2, el user message lo agregamos arriba al recibir la Tool.
        // En Lesson 1, usamos el evento standard de transcripción.
        if (
          lesson === 1 &&
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const text = data.transcript?.trim();
          if (text) {
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text,
                timestamp: Date.now(),
              },
            ]);
          }
        }

        if (data.type === "response.audio_transcript.done") {
          const assistantText = data.transcript?.trim();
          if (assistantText) {
            console.log("🤖 [AI SPOKE]", assistantText);
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                text: assistantText,
                timestamp: Date.now(),
              },
            ]);
          }
        }
      };

      // 4. Conexión SDP Standard
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
      setErrorMessage("Error al iniciar la conversación");
    }
  };

  const stopConversation = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
  };

  return {
    connectionState,
    errorMessage,
    messages,
    currentLesson: lesson,
    currentStep,
    startConversation,
    stopConversation,
  };
}
