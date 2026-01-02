import { useState, useRef, useEffect } from "react";

/* =====================================================
   TYPES
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
   🛑 WHAT DOES → SOLO ESPAÑOL (LOGICA DE VALIDACIÓN)
===================================================== */

const WHAT_DOES_START = 25;
const WHAT_DOES_END = 32;

const ENGLISH_WORDS = [
  "computer",
  "office",
  "paper",
  "employee",
  "director",
  "student",
  "conference room",
  "classroom",
];

const WHAT_DOES_ANSWERS: Record<number, string[]> = {
  25: ["computadora"],
  26: ["oficina"],
  27: ["papel"],
  28: ["empleado"],
  29: ["director"],
  30: ["estudiante"],
  31: ["sala de conferencias", "sala de conferencia"],
  32: ["aula", "salón de clases", "salon de clase"],
};

function isWhatDoesQuestion(index: number): boolean {
  return index >= WHAT_DOES_START && index <= WHAT_DOES_END;
}

function getWhatDoesQuestionText(qIndex: number): string | null {
  const questionMap: Record<number, string> = {
    25: "What does computer mean in Spanish?",
    26: "What does office mean?",
    27: "What does paper mean?",
    28: "What does employee mean?",
    29: "What does director mean?",
    30: "What does student mean?",
    31: "What does conference room mean?",
    32: "What does classroom mean?",
  };
  return questionMap[qIndex] || null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?¿¡"]/g, "")
    .trim();
}

function looksLikeEnglish(text: string): boolean {
  return ENGLISH_WORDS.includes(normalize(text));
}

function looksLikeValidSpanishMeaning(text: string, qIndex: number): boolean {
  const expected = WHAT_DOES_ANSWERS[qIndex];
  if (!expected) return false;
  const t = normalize(text);
  return expected.some((w) => t.includes(normalize(w)));
}

/* =====================================================
   HOOK PRINCIPAL (Lesson 1)
===================================================== */

export function useLesson1Conversation({ part = 1 } = {}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentStep] = useState<Lesson1Step>("NAME");

  /* ===================== REFS ===================== */

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const currentQuestionIndexRef = useRef<number>(0);
  const speechStartedAtRef = useRef<number | null>(null);

  // Control de flujo estricto
  const canAdvanceRef = useRef(true);
  const answerTurnRef = useRef(0);
  const lastApprovedTurnRef = useRef<number | null>(null);

  /* ===================== HELPERS ===================== */

  function requestModelResponse() {
    if (!canAdvanceRef.current) {
      console.log("🛑 NOT requesting model response (blocked)");
      return;
    }
    // Forzamos a la IA a generar respuesta
    dcRef.current?.send(JSON.stringify({ type: "response.create" }));
  }

  /* ===================== CLEANUP ===================== */

  useEffect(() => {
    return () => {
      stopConversation().catch(console.error);
    };
  }, []);

  const stopConversation = async () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();

    mediaStreamRef.current = null;
    dcRef.current = null;
    pcRef.current = null;
    audioRef.current = null;

    canAdvanceRef.current = true;
    lastApprovedTurnRef.current = null;
    answerTurnRef.current = 0;

    setConnectionState("ended");
  };

  /* ===================== START ===================== */

  const startConversation = async () => {
    try {
      setConnectionState("connecting");

      // Nota: Mantenemos tu fetch original, solo agregamos el query param por si el backend lo necesita
      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=1&part=${part}`,
      );
      const { token, currentQuestionIndex } = await tokenRes.json();
      currentQuestionIndexRef.current = currentQuestionIndex ?? 0;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Audio activado (Lesson 1)
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
        setConnectionState("active");
        // Apenas abre, pedimos a la IA que hable (inicia la lección)
        requestModelResponse();
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // 🎤 Usuario empezó a hablar
        if (data.type === "input_audio_buffer.speech_started") {
          speechStartedAtRef.current = Date.now();
          return;
        }

        /* ---------- STUDENT (Lógica de Validación) ---------- */
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const text = data.transcript?.trim();

          // Filtros básicos de ruido
          if (!text || text.length < 2 || !/[a-zA-Z]/.test(text)) return;

          const ts = speechStartedAtRef.current ?? Date.now();
          speechStartedAtRef.current = null;

          console.log(`👤 USER: "${text}"`);

          // ✅ MOSTRAR SIEMPRE LO QUE DIJO EL USUARIO
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: "user", text, timestamp: ts },
          ]);

          answerTurnRef.current += 1;
          const myTurn = answerTurnRef.current;
          const qIndex = currentQuestionIndexRef.current;

          // Bloqueamos avance hasta validar
          canAdvanceRef.current = false;

          // 1. CHEQUEO: ¿Respondió en inglés cuando debía ser español?
          if (isWhatDoesQuestion(qIndex) && looksLikeEnglish(text)) {
            console.log("❌ Detectado Inglés en ejercicio de traducción");
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                text: "Tenés que responder en español. Ejemplo: “employee” significa “empleado”.",
                timestamp: Date.now(),
              },
            ]);

            const questionText = getWhatDoesQuestionText(qIndex);
            if (questionText && dcRef.current) {
              dcRef.current.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions: `Repeat EXACTLY: "${questionText}"`,
                  },
                }),
              );
            }
            return;
          }

          // 2. CHEQUEO: ¿Respuesta incorrecta en "What Does"?
          if (
            isWhatDoesQuestion(qIndex) &&
            !looksLikeValidSpanishMeaning(text, qIndex)
          ) {
            console.log("❌ Traducción incorrecta");
            const questionText = getWhatDoesQuestionText(qIndex);
            if (questionText && dcRef.current) {
              dcRef.current.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions: `Say "Incorrect, try again." then Repeat EXACTLY: "${questionText}"`,
                  },
                }),
              );
            }
            return;
          }

          // ✅ CORRECTO (O pregunta normal de conversación)
          canAdvanceRef.current = true;
          lastApprovedTurnRef.current = myTurn;

          // Dejamos que la IA avance
          requestModelResponse();
          return;
        }

        /* ---------- AI ---------- */
        if (data.type === "response.audio_transcript.done") {
          const assistantText = data.transcript?.trim();
          if (!assistantText) return;

          // Mostrar respuesta IA
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: assistantText,
              timestamp: Date.now(),
            },
          ]);

          // 🔒 SOLO avanzar índice si esta respuesta corresponde a un turno aprobado
          if (
            !canAdvanceRef.current ||
            lastApprovedTurnRef.current !== answerTurnRef.current
          ) {
            console.log(
              "⛔ AI response ignored for index increment (validation pending or old)",
            );
            return;
          }

          // Avanzamos el índice para la próxima
          currentQuestionIndexRef.current += 1;
          console.log(
            `✅ Index advanced to: ${currentQuestionIndexRef.current}`,
          );
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
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
      stopConversation();
    }
  };

  return {
    connectionState,
    errorMessage,
    messages,
    startConversation, // Ya no necesitamos pasar currentLesson/Step porque lo maneja internamente este hook específico
    stopConversation,
  };
}
