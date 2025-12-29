import { useState, useRef } from "react";
import { SIMPLE_CONVERSATION_PROMPT } from "../../../server/prompts/simpleConversationPrompt";
import { SIMPLE_CONVERSATION_PROMPT_2 } from "../../../server/prompts/simpleConversationPrompt2";

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

  /* ===== TURN STATE ===== */
  type TurnState =
    | "AI_PREPARING_RESPONSE"
    | "AI_SPEAKING"
    | "WAITING_FOR_USER"
    | "PROCESSING_USER";

  const turnStateRef = useRef<TurnState>("AI_PREPARING_RESPONSE");

  const requestModelResponse = () => {
    if (turnStateRef.current !== "AI_PREPARING_RESPONSE") return;
    if (dcRef.current?.readyState !== "open") return;

    console.log("[TURN] AI_PREPARING_RESPONSE → AI_SPEAKING");
    turnStateRef.current = "AI_SPEAKING";
    dcRef.current.send(JSON.stringify({ type: "response.create" }));
  };

  const stopConversation = async () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");

      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lesson}&part=${part}`,
      );
      const response = await tokenRes.json();

      sessionIdRef.current = response.sessionId;
      currentQuestionIndexRef.current = response.currentQuestionIndex ?? 0;

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

        const instructions =
          lesson === 1
            ? SIMPLE_CONVERSATION_PROMPT
            : SIMPLE_CONVERSATION_PROMPT_2;

        dc.send(
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

        turnStateRef.current = "AI_PREPARING_RESPONSE";
        requestModelResponse();
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);

        /* USER */
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          if (turnStateRef.current !== "WAITING_FOR_USER") return;

          const text = data.transcript?.trim();
          if (!text) return;

          turnStateRef.current = "PROCESSING_USER";

          const grammar = validateStudentGrammar(text);
          if (!grammar.isValid) {
            dc.send(
              JSON.stringify({
                type: "response.create",
                response: { instructions: grammar.feedback },
              }),
            );
            turnStateRef.current = "AI_PREPARING_RESPONSE";
            return;
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

          turnStateRef.current = "WAITING_FOR_USER";
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
      stopConversation();
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
          body: JSON.stringify({ aiTranscript }),
        },
      );

      const data = await res.json();
      if (data.advanced) {
        currentQuestionIndexRef.current = data.currentIndex;
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
