import { useState, useRef, useEffect, useCallback } from "react";
import { SIMPLE_CONVERSATION_PROMPT } from "../../../server/prompts/simpleConversationPrompt";

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
  31: ["sala de conferencias"],
  32: ["aula", "salón de clases"],
};

/* =====================================================
    VALIDATORS
===================================================== */

function isWhatDoesQuestion(index: number): boolean {
  return index >= WHAT_DOES_START && index <= WHAT_DOES_END;
}

function getWhatDoesQuestionText(qIndex: number): string {
  const map: Record<number, string> = {
    25: "What does computer mean in Spanish?",
    26: "What does office mean?",
    27: "What does paper mean?",
    28: "What does employee mean?",
    29: "What does director mean?",
    30: "What does student mean?",
    31: "What does conference room mean?",
    32: "What does classroom mean?",
  };
  return map[qIndex] || "Question";
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

function validateStudentGrammar(text: string): {
  isValid: boolean;
  feedback?: string;
} {
  const t = text.toLowerCase();

  // 1. Contracciones
  const forbidden = ["don't", "can't", "won't", "it's", "i'm"];
  const found = forbidden.find((c) => t.includes(c));
  if (found) {
    return {
      isValid: false,
      feedback:
        "No uses contracciones. Por favor, di la forma completa (ejemplo: 'do not' en lugar de 'don't').",
    };
  }

  // 2. Like to
  if (t.includes("like") && !t.includes("like to")) {
    const verbs = [
      "play",
      "cook",
      "read",
      "dance",
      "study",
      "watch",
      "ride",
      "go",
      "practice",
    ];
    if (verbs.some((v) => t.includes(v))) {
      return {
        isValid: false,
        feedback:
          "Casi 😄 Recuerda usar 'like to' antes del verbo. Por ejemplo: 'I like to cook'.",
      };
    }
  }
  return { isValid: true };
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
  const currentPartRef = useRef<number>(1);
  const currentQuestionInPartRef = useRef<number>(1);

  // --- CONTROL DE FLUJO Y SEMÁFORO ---
  const canAdvanceRef = useRef(true); // Bloqueo lógico (gramática/idioma)
  const expectingResponseRef = useRef(false); // SEMÁFORO (Turn Lock)
  const isProcessingRef = useRef(false); // Bloqueo de red

  const requestModelResponse = () => {
    if (canAdvanceRef.current && dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({ type: "response.create" }));
    }
  };

  const stopConversation = async () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();

    mediaStreamRef.current = null;
    dcRef.current = null;
    pcRef.current = null;
    audioRef.current = null;

    setConnectionState("ended");
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");

      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lesson}&part=${part}`,
      );
      const response = await tokenRes.json();
      const {
        token,
        sessionId,
        currentQuestionIndex,
        currentQuestionInPart,
        part: responsePart,
      } = response;

      sessionIdRef.current = sessionId;
      if (lesson === 2) {
        currentPartRef.current = responsePart ?? part;
        currentQuestionInPartRef.current = currentQuestionInPart ?? 1;
      } else {
        currentQuestionIndexRef.current = currentQuestionIndex ?? 0;
      }

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
        setConnectionState("active");

        // Inicializar sesión con prompt estricto si es Lección 1
        if (lesson === 1) {
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: SIMPLE_CONVERSATION_PROMPT,
                tool_choice: "none",
                temperature: 0.6,
              },
            }),
          );
        }

        // Iniciamos el semáforo en rojo hasta que el usuario hable
        expectingResponseRef.current = false;
        requestModelResponse();
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // --- 1. USUARIO HABLA ---
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const text = data.transcript?.trim();

          const isGarbage = !text || text.length < 3 || /^(swooshy|electrolytes|uh|um)$/i.test(text);

          if (isGarbage) {
            console.log(`[GARBAGE DETECTED] "${text}" - Cancelling AI response.`);

            dcRef.current?.send(JSON.stringify({ 
              type: "response.cancel" 
            }));

            if (data.item_id) {
               dcRef.current?.send(JSON.stringify({ 
                 type: "conversation.item.delete",
                 item_id: data.item_id
               }));
            }
            return;
          }

          // Filtro de ruido
          if (!text || text.length < 2) {
            // Si es ruido, NO tocamos el semáforo. Dejamos que siga en el estado que estaba.
            return;
          }

          const qIndex = currentQuestionIndexRef.current;

          // Validar gramática
          const grammar = validateStudentGrammar(text);
          if (!grammar.isValid) {
            canAdvanceRef.current = false;
            expectingResponseRef.current = false; // Bloqueamos semáforo (va a corregir)
            dcRef.current?.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  instructions: `Error: "${text}". Feedback: ${grammar.feedback}. Execute CORRECTION ALGORITHM.`,
                },
              }),
            );
            return;
          }

          // Validar idioma (What does)
          if (isWhatDoesQuestion(qIndex)) {
            if (looksLikeEnglish(text)) {
              canAdvanceRef.current = false;
              expectingResponseRef.current = false;
              dcRef.current?.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions: `Error: Answered in English. Tell student to translate to Spanish and repeat: "${getWhatDoesQuestionText(qIndex)}"`,
                  },
                }),
              );
              return;
            }
            if (!looksLikeValidSpanishMeaning(text, qIndex)) {
              canAdvanceRef.current = false;
              expectingResponseRef.current = false;
              dcRef.current?.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions: `Error: Incorrect meaning. Explain in Spanish and repeat: "${getWhatDoesQuestionText(qIndex)}"`,
                  },
                }),
              );
              return;
            }
          }

          // Respuesta válida
          canAdvanceRef.current = true;
          expectingResponseRef.current = true; // SEMÁFORO VERDE: Esperamos respuesta de IA para avanzar

          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "user",
              text,
              timestamp: Date.now(),
            },
          ]);
          requestModelResponse();
        }

        // --- 2. IA RESPONDE ---
        if (data.type === "response.audio_transcript.done") {
          const assistantText = data.transcript?.trim();
          if (!assistantText) return;

          // Solo avanzamos si el semáforo estaba verde
          if (expectingResponseRef.current) {
            handleAdvanceLogic(assistantText);
            expectingResponseRef.current = false; // Volvemos a rojo
          } else {
            console.log(
              "🔒 [LOCKED] AI spoke but advance logic skipped (Semaphore Red)",
            );
          }

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

  // --- LÓGICA DE AVANCE CENTRALIZADA ---
  const handleAdvanceLogic = async (aiTranscript: string) => {
    if (
      !sessionIdRef.current ||
      !canAdvanceRef.current ||
      isProcessingRef.current
    )
      return;

    isProcessingRef.current = true;
    try {
      // 1. LECCIÓN 2 (Lógica compleja)
      if (lesson === 2) {
        const res = await fetch(
          `/api/assistant/lesson2-session/${sessionIdRef.current}/advance`,
          { method: "POST" },
        );
        const data = await res.json();

        if (data.advanced) {
          currentPartRef.current = data.currentPart;
          currentQuestionInPartRef.current = data.currentQuestionInPart;
          console.log(
            `[L2] Advanced to Part ${data.currentPart} Q${data.currentQuestionInPart}`,
          );

          // Actualizar contexto de OpenAI con la nueva parte/pregunta
          if (data.nextContext && dcRef.current?.readyState === "open") {
            dcRef.current.send(
              JSON.stringify({
                type: "session.update",
                session: {
                  instructions: `CONTEXT UPDATE: ${data.nextContext}`,
                },
              }),
            );
          }
        }
      }
      // 2. LECCIÓN 1 (Lógica simple)
      else {
        // Llamamos a process-response para validar el avance y obtener la siguiente pregunta
        const res = await fetch(
          `/api/assistant/simple-session/${sessionIdRef.current}/process-response`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aiTranscript }),
          },
        );
        const data = await res.json();

        if (data.advanced) {
          currentQuestionIndexRef.current = data.currentIndex;
          console.log(`[L1] Advanced to Question ${data.currentIndex}`);

          // Actualizar contexto de OpenAI con la nueva pregunta OBLIGATORIA
          if (dcRef.current?.readyState === "open") {
            dcRef.current.send(
              JSON.stringify({
                type: "session.update",
                session: {
                  instructions: `STRICT UPDATE: You are now on Question ${data.currentIndex}. Ask ONLY: "${data.currentQuestion}".`,
                },
              }),
            );
            // Disparamos la nueva pregunta inmediatamente (opcional, o esperamos al usuario)
            setTimeout(
              () =>
                dcRef.current?.send(
                  JSON.stringify({ type: "response.create" }),
                ),
              100,
            );
          }
        }
      }
    } catch (e) {
      console.error("Advance error:", e);
    } finally {
      isProcessingRef.current = false;
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
    requestSessionRecap: () => {},
  };
}
