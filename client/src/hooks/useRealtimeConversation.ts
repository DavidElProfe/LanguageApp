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

  // SEMÁFORO: Para evitar que la IA se interrumpa a sí misma
  const isAiSpeakingRef = useRef<boolean>(false);

  /* =====================================================
      HELPER: SEND COMMAND TO AI (TITIRITERO)
  ===================================================== */
  /* =====================================================
      HELPER: SEND COMMAND TO AI (TITIRITERO)
  ===================================================== */
  const forceAISpeech = (textToSay: string) => {
    if (dcRef.current?.readyState !== "open") return;

    console.log(
      "🚨 [TITIRITERO] Intentando forzar a la IA a decir:",
      textToSay,
    );

    // Marcamos que la IA va a hablar (para el filtro anti-eco)
    isAiSpeakingRef.current = true;

    // 1. UI Optimista (Para que lo veas instantáneo en pantalla)
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: textToSay,
        timestamp: Date.now(),
      },
    ]);

    // 2. LIMPIEZA DE BUFFER
    dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));

    // 3. ¡ELIMINADO! Ya no enviamos "conversation.item.create" aquí.
    // Dejamos que la IA cree el item real con el response.create.

    // 4. ORDENAR HABLAR
    dcRef.current.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
          instructions: `SAY EXACTLY: "${textToSay}"`,
          tool_choice: "none", // Forzamos voz
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
        console.log("[DC] open");
        setConnectionState("active");

        if (lesson === 1) {
          const question1Text =
            "Hi, I'm your conversation partner. What is your name?";
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: `${SIMPLE_CONVERSATION_PROMPT} \n Ask: "${question1Text}"`,
                tool_choice: "none",
                temperature: 0.6,
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        }

        if (lesson === 2) {
          currentQuestionIndexRef.current = 0;
          const firstQuestion = LESSON_2_VOICE_MVP_QUESTIONS[0];
          console.log("[L2] Starting Drill with:", firstQuestion);

          // Esperamos un momento para que el audio esté listo
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

        // --- GESTIÓN DE ESTADO DE AUDIO ---
        // Cuando la IA empieza a hablar
        if (data.type === "response.audio.delta") {
          if (!isAiSpeakingRef.current) {
            console.log("🔊 [SYSTEM] Recibiendo Audio Streaming...");
          }

          isAiSpeakingRef.current = true;
        }
        // Cuando la IA termina de hablar
        if (data.type === "response.done") {
          // Le damos un pequeño "tiempo de gracia" para que muera el eco
          setTimeout(() => {
            isAiSpeakingRef.current = false;
            console.log("✅ [SYSTEM] IA terminó. Escuchando usuario...");
          }, 500);
        }

        // --- MANEJO DE TOOLS ---
        if (data.type === "response.function_call_arguments.done") {
          const toolName = data.name;
          const args = JSON.parse(data.arguments);
          const callId = data.call_id;

          // Cerrar ciclo de tool
          if (callId) {
            dc.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: callId,
                  output: JSON.stringify({ success: true }),
                },
              }),
            );
          }

          if (toolName === "process_student_answer") {
            const transcript = args.transcript;

            // --- FILTROS DE SEGURIDAD (ANTI-ECO / ANTI-ALUCINACIÓN) ---

            // 1. Si la IA estaba hablando cuando "escuchó" esto -> DESCARTAR
            if (isAiSpeakingRef.current) {
              console.warn(
                "🛡️ [FILTRO] Ignorando input mientras la IA habla/eco.",
              );
              return;
            }

            // 2. Si el texto es igual a la pregunta -> DESCARTAR (Eco)
            const currentQ =
              LESSON_2_VOICE_MVP_QUESTIONS[currentQuestionIndexRef.current];
            const cleanTranscript = transcript
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");
            const cleanQuestion = currentQ
              ? currentQ.toLowerCase().replace(/[^a-z0-9]/g, "")
              : "";

            if (cleanQuestion && cleanTranscript.includes(cleanQuestion)) {
              console.warn(`🛡️ [FILTRO] Eco detectado: "${transcript}"`);
              return;
            }

            console.log("🎤 [VALIDO] Usuario dijo:", transcript);

            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: transcript,
                timestamp: Date.now(),
              },
            ]);

            // Avanzar
            const nextIndex = currentQuestionIndexRef.current + 1;
            currentQuestionIndexRef.current = nextIndex;
            const nextQuestion = LESSON_2_VOICE_MVP_QUESTIONS[nextIndex];

            setTimeout(() => {
              if (nextQuestion) {
                forceAISpeech(`${nextQuestion}`);
              } else {
                forceAISpeech("Excellent work. Lesson finished.");
              }
            }, 200);
          }
        }

        // --- VISUALIZACIÓN LESSON 1 ---
        if (lesson === 1) {
          if (
            data.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const text = data.transcript?.trim();
            if (text)
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
          if (data.type === "response.audio_transcript.done") {
            const text = data.transcript?.trim();
            if (text)
              setMessages((m) => [
                ...m,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  text,
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
