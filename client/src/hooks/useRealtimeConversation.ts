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
  const forceAISpeech = (textToSay: string) => {
    if (dcRef.current?.readyState !== "open") return;

    // 1. UI Optimista (Mostrar texto ya)
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: textToSay,
        timestamp: Date.now(),
      },
    ]);

    // 2. Limpieza de Buffer (Para que no escuche ecos ni alucinaciones)
    dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));

    // 3. Insertar mensaje en historial para contexto
    dcRef.current.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: textToSay }],
        },
      }),
    );

    // 4. EL TRUCO FINAL: Response Create con "tool_choice: none"
    // Al enviar tool_choice: "none" AQUÍ, anulamos el "required" del backend
    // solo por este turno, permitiendo que la IA hable.
    dcRef.current.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
          instructions: `
            SYSTEM OVERRIDE: You are temporarily a Text-to-Speech engine.
            IGNORE the "Use Tools" rule.
            READ this text aloud: "${textToSay}"
          `,
          tool_choice: "none", // <--- ESTO ES LA LLAVE QUE DESBLOQUEA LA VOZ
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

      // 1. Obtenemos Token y Session ID
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

          setTimeout(() => {
            forceAISpeech(firstQuestion);
          }, 500);
        }
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);

        /* ---------------- A. MANEJO DE TOOLS (Lesson 2) ---------------- */
        if (data.type === "response.function_call_arguments.done") {
          const toolName = data.name;
          const args = JSON.parse(data.arguments);
          const callId = data.call_id; // <--- IMPORTANTE: Necesitamos el ID

          // 1. SIEMPRE CERRAMOS EL CICLO DE LA TOOL
          // Si no enviamos esto, la IA se queda "pensando" en la función y no acepta
          // la siguiente orden de audio.
          if (callId) {
            dc.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: callId,
                  output: JSON.stringify({ success: true }), // Respuesta dummy para liberar a la IA
                },
              }),
            );
          }

          if (toolName === "ignore_noise") {
            console.log("🔇 [AI] Ignorando ruido/silencio.");
            // No hacemos NADA más.
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
            const nextIndex = currentQuestionIndexRef.current + 1;
            currentQuestionIndexRef.current = nextIndex;

            const nextQuestion = LESSON_2_VOICE_MVP_QUESTIONS[nextIndex];

            // Pequeño delay para naturalidad
            setTimeout(() => {
              if (nextQuestion) {
                // Feedback + Siguiente Pregunta
                const feedbackText = `Good. Next: ${nextQuestion}`;
                forceAISpeech(feedbackText);
              } else {
                // Fin de la lección
                forceAISpeech("Excellent work. We have finished the lesson.");
              }
            }, 100);
          }
        }

        /* ---------------- B. VISUALIZACIÓN ---------------- */

        // VISUALIZACIÓN USER (Solo Lesson 1 usa el evento standard)
        // En Lesson 2, el mensaje user lo agregamos arriba en 'process_student_answer'
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

        // VISUALIZACIÓN ASSISTANT
        // Para Lesson 2, usamos Optimistic UI en forceAISpeech, así que ignoramos este evento
        // para evitar duplicados. Solo lo usamos para Lesson 1.
        if (lesson === 1 && data.type === "response.audio_transcript.done") {
          const assistantText = data.transcript?.trim();
          if (assistantText) {
            console.log("🤖 [AI SPOKE - L1]", assistantText);
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
