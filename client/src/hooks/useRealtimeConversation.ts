import { useState, useRef } from "react";
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

  const isProcessingRef = useRef<boolean>(false);

  /* =====================================================
      HELPER: FORCE AI SPEECH (TITIRITERO)
  ===================================================== */
  const forceAISpeech = (textToSay: string) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") return;

    console.log(`🔵 [TITIRITERO] Ordenando: "${textToSay}"`);

    // Limpiamos buffer por seguridad
    dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));

    // Mandamos la orden estricta
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

      dc.onopen = () => {
        console.log("✅ [DC] OPEN");
        setConnectionState("active");

        if (lesson === 1) {
          const question1Text =
            "Hi, I'm your conversation partner. What is your name?";
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: `${SIMPLE_CONVERSATION_PROMPT} \n Ask: "${question1Text}"`,
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        }

        if (lesson === 2) {
          // CONFIGURACIÓN INICIAL DRILL
          currentQuestionIndexRef.current = 0;

          // Configuramos para que sepa que es un robot, aunque el "reflejo" siga vivo
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions:
                  "System: You are a passive reading engine. Wait for commands.",
                tool_choice: "none",
                temperature: 0.6,
              },
            }),
          );

          const firstQuestion = LESSON_2_VOICE_MVP_QUESTIONS[0];
          setTimeout(() => {
            forceAISpeech(firstQuestion);
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

        // ==========================================================
        // 🔪 EL ASESINO DE REFLEJOS (SOLUCIÓN A "DOS LÓGICAS")
        // ==========================================================
        // Cuando detectamos que el usuario dejó de hablar, la IA automáticamente
        // intentará responder. AQUÍ LA MATAMOS antes de que empiece.
        if (data.type === "input_audio_buffer.speech_stopped") {
          if (lesson === 2) {
            console.log(
              "🤫 [SILENCIADOR] Speech stopped -> Cancelando respuesta automática.",
            );
            dc.send(JSON.stringify({ type: "response.cancel" }));
          }
        }

        // ==========================================================
        // 🧠 EL CEREBRO TITIRITERO (TU LÓGICA)
        // ==========================================================
        // Usamos la transcripción para decidir nosotros qué sigue.
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();

          if (!userText) return;

          if (lesson === 2) {
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

            console.log(`👤 [USER] "${userText}"`);
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: userText,
                timestamp: Date.now(),
              },
            ]);

            // Avanzamos
            const nextIndex = currentQuestionIndexRef.current + 1;
            currentQuestionIndexRef.current = nextIndex;
            const nextQuestion = LESSON_2_VOICE_MVP_QUESTIONS[nextIndex];

            // Esperamos un poquito para que sea natural
            setTimeout(() => {
              isProcessingRef.current = false;
              if (nextQuestion) {
                forceAISpeech(`Good. Next: ${nextQuestion}`);
              } else {
                forceAISpeech("Excellent work. Lesson finished.");
              }
            }, 500);
          } else {
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

        if (data.type === "response.audio_transcript.done") {
          const aiText = data.transcript;
          // Solo mostramos si no está vacía (a veces el cancel genera strings vacíos)
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
