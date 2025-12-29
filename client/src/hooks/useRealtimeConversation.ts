import { useState, useRef } from "react";
import { SIMPLE_CONVERSATION_PROMPT } from "../../../server/prompts/simpleConversationPrompt";
import { SIMPLE_CONVERSATION_PROMPT_2 } from "../../../server/prompts/simpleConversationPrompt2";

/* =====================================================
   TYPES & CONSTANTS
===================================================== */
type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

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

function validateStudentGrammar(text: string) {
  const t = text.toLowerCase();

  const forbidden = ["don't", "can't", "won't", "it's", "i'm"];
  const found = forbidden.find((c) => t.includes(c));
  if (found) {
    return {
      isValid: false,
      feedback: "No uses contracciones. Usa la forma completa (ej: do not).",
    };
  }

  if (t.includes("like") && !t.includes("like to")) {
    // (tu check original era medio agresivo; lo dejo igual)
    return {
      isValid: false,
      feedback: "Recuerda usar 'like to' antes del verbo. Ej: I like to cook.",
    };
  }

  return { isValid: true };
}

/* =====================================================
   HOOK
===================================================== */
export function useRealtimeConversation({ lesson = 1, part = 1 } = {}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const currentQuestionIndexRef = useRef<number>(0);
  const currentPartRef = useRef<number>(1);
  const currentQuestionInPartRef = useRef<number>(1);

  const isProcessingRef = useRef(false);

  // guardamos el último input del alumno para mandarlo al backend si querés
  const lastStudentTranscriptRef = useRef<string>("");

  /* ===== TURN STATE ===== */
  type TurnState =
    | "AI_PREPARING_RESPONSE"
    | "AI_SPEAKING"
    | "WAITING_FOR_USER"
    | "PROCESSING_USER";

  const turnStateRef = useRef<TurnState>("AI_PREPARING_RESPONSE");

  // 🔑 para evitar el bug: NO response.create hasta session.updated
  const sessionUpdatedRef = useRef(false);
  const pendingInitialResponseRef = useRef(false);

  // 🔇 para evitar “audio antes del prompt”: muteamos tracks hasta session.updated
  const micEnabledRef = useRef(false);

  const requestModelResponse = () => {
    if (!sessionUpdatedRef.current) {
      console.log("[BLOCK] response.create before session.updated");
      pendingInitialResponseRef.current = true;
      return;
    }
    if (turnStateRef.current !== "AI_PREPARING_RESPONSE") return;
    if (dcRef.current?.readyState !== "open") return;

    console.log("[TURN] AI_PREPARING_RESPONSE → AI_SPEAKING");
    turnStateRef.current = "AI_SPEAKING";
    dcRef.current.send(JSON.stringify({ type: "response.create" }));
  };

  // 🔁 Inyecta la próxima pregunta en la sesión Realtime
  const injectNextQuestion = (questionText: string) => {
    const basePrompt =
      lesson === 1 ? SIMPLE_CONVERSATION_PROMPT : SIMPLE_CONVERSATION_PROMPT_2;

    const instructions = `
  ${basePrompt}

  CURRENT_QUESTION = "${questionText}"

  RULES:
  - Ask EXACTLY CURRENT_QUESTION.
  - Ask it ONCE.
  - Do NOT add anything else.
  - Then STOP and WAIT.
  `;

    pendingInitialResponseRef.current = true;

    dcRef.current?.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions,
          tool_choice: "none",
          temperature: lesson === 1 ? 0.6 : 0.3,
          turn_detection: null,
        },
      }),
    );

    console.log("[NEXT QUESTION INJECTED]", questionText);
  };

  const enableMicTracks = () => {
    if (micEnabledRef.current) return;
    micEnabledRef.current = true;

    const stream = mediaStreamRef.current;
    if (!stream) return;

    stream.getAudioTracks().forEach((t) => {
      t.enabled = true;
    });

    console.log("[AUDIO] Mic enabled after session.updated");
  };

  const disableMicTracks = () => {
    const stream = mediaStreamRef.current;
    if (!stream) return;

    stream.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });

    micEnabledRef.current = false;
    console.log("[AUDIO] Mic disabled (pre-session.updated)");
  };

  const stopConversation = async () => {
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    try {
      audioRef.current?.remove();
    } catch {}

    mediaStreamRef.current = null;
    dcRef.current = null;
    pcRef.current = null;
    audioRef.current = null;

    sessionUpdatedRef.current = false;
    pendingInitialResponseRef.current = false;
    micEnabledRef.current = false;

    setConnectionState("ended");
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage("");

      sessionUpdatedRef.current = false;
      pendingInitialResponseRef.current = false;
      lastStudentTranscriptRef.current = "";

      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lesson}&part=${part}`,
      );
      const response = await tokenRes.json();

      sessionIdRef.current = response.sessionId;
      currentQuestionIndexRef.current = response.currentQuestionIndex ?? 0;

      // si lesson 2 te devuelve part / currentQuestionInPart, guardalos
      if (lesson === 2) {
        currentPartRef.current = response.part ?? part;
        currentQuestionInPartRef.current = response.currentQuestionInPart ?? 1;
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      // 1) Pedimos mic, pero lo dejamos “muteado” hasta session.updated
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      disableMicTracks(); // 🔒 clave

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        setConnectionState("active");
        console.log("[DC] open");

        const basePrompt =
          lesson === 1
            ? SIMPLE_CONVERSATION_PROMPT
            : SIMPLE_CONVERSATION_PROMPT_2;

        const firstQuestion =
          lesson === 1
            ? `Hi, I'm your conversation partner from The Language School. What is your name?`
            : `What is your name?`;

        const instructions = `
        ${basePrompt}

        # SYSTEM START (ABSOLUTE)

        CURRENT_QUESTION = "${firstQuestion}"

        CONSTRAINTS:
        - You MUST ask EXACTLY CURRENT_QUESTION.
        - You are NOT allowed to ask any other question.
        - Do NOT add greetings.
        - Do NOT add context.
        - Ask it ONCE.
        - After asking, STOP and WAIT.

        # END SYSTEM START
        `;

        // 2) Mandamos session.update, pero NO disparamos response.create todavía
        //    (esperamos session.updated)
        pendingInitialResponseRef.current = true;

        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions,
              tool_choice: "none",
              temperature: lesson === 1 ? 0.6 : 0.3,
              // ✅ Realtime JSON acepta null para desactivar VAD / turn detection
              // Si tu TS se queja en otro lugar, acá es string JSON, no tipado.
              turn_detection: null,
            } as any,
          }),
        );

        console.log("[SESSION_UPDATE_SENT]");
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // 🔎 log de todo (para confirmar orden real)
        console.log("[DC EVENT]", data.type, data);

        // ✅ confirmación de que el prompt ya está aplicado
        if (data.type === "session.updated") {
          sessionUpdatedRef.current = true;

          // habilitamos mic recién ahora
          enableMicTracks();

          if (pendingInitialResponseRef.current) {
            pendingInitialResponseRef.current = false;
            turnStateRef.current = "AI_PREPARING_RESPONSE";
            requestModelResponse();
          }
          return;
        }

        /* USER */
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          // Solo aceptamos input si esperamos al usuario
          if (turnStateRef.current !== "WAITING_FOR_USER") return;

          const text = data.transcript?.trim();
          if (!text) return;

          // basura rápida
          if (text.length < 2) return;

          lastStudentTranscriptRef.current = text;

          turnStateRef.current = "PROCESSING_USER";

          const qIndex = currentQuestionIndexRef.current;

          // grammar
          const grammar = validateStudentGrammar(text);
          if (!grammar.isValid) {
            // corrección (una sola respuesta)
            dc.send(
              JSON.stringify({
                type: "response.create",
                response: { instructions: grammar.feedback },
              }),
            );
            turnStateRef.current = "AI_PREPARING_RESPONSE";
            return;
          }

          // what does guardrail
          if (isWhatDoesQuestion(qIndex)) {
            if (looksLikeEnglish(text)) {
              dc.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions: `Answer in Spanish. Repeat: "${getWhatDoesQuestionText(
                      qIndex,
                    )}"`,
                  },
                }),
              );
              turnStateRef.current = "AI_PREPARING_RESPONSE";
              return;
            }

            if (!looksLikeValidSpanishMeaning(text, qIndex)) {
              dc.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions: `Incorrect meaning. Explain in Spanish and repeat: "${getWhatDoesQuestionText(
                      qIndex,
                    )}"`,
                  },
                }),
              );
              turnStateRef.current = "AI_PREPARING_RESPONSE";
              return;
            }
          }

          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "user",
              text,
              timestamp: Date.now(),
            },
          ]);

          turnStateRef.current = "AI_PREPARING_RESPONSE";
          requestModelResponse();
        }

        /* AI */
        if (data.type === "response.audio_transcript.done") {
          const text = data.transcript?.trim();
          if (!text) return;

          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text,
              timestamp: Date.now(),
            },
          ]);

          // cuando la IA termina, esperamos al usuario
          turnStateRef.current = "WAITING_FOR_USER";

          // avance de lógica (cambia pregunta/parte)
          handleAdvanceLogic(text);
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
    } catch (e) {
      console.error(e);
      setErrorMessage("Error al iniciar conversación");
      await stopConversation();
    }
  };

  const handleAdvanceLogic = async (aiTranscript: string) => {
    if (!sessionIdRef.current || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const res = await fetch(
        `/api/assistant/simple-session/${sessionIdRef.current}/process-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aiTranscript,
            studentTranscript: lastStudentTranscriptRef.current,
          }),
        },
      );

      const data = await res.json();

      if (data?.advanced) {
        currentQuestionIndexRef.current = data.currentIndex;

        // 🔑 obtenemos el texto de la próxima pregunta
        const nextQuestion = getWhatDoesQuestionText(data.currentIndex);

        injectNextQuestion(nextQuestion);
        turnStateRef.current = "AI_PREPARING_RESPONSE";
        requestModelResponse();
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  return {
    connectionState,
    errorMessage,
    messages,
    startConversation,
    stopConversation,
  };
}
