import { useState, useRef, useEffect, useCallback } from "react";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface LessonState {
  globalQuestionIndex: number;
  correctCount: number;
  incorrectCount: number;
}

interface UseSimpleConversationReturn {
  connectionState: ConnectionState;
  errorMessage: string;
  messages: ConversationMessage[];
  lessonProgress: LessonState;
  startConversation: () => Promise<void>;
  stopConversation: () => Promise<void>;
}

const QUESTION_BLOCK_SIZE = 5;
const TOTAL_QUESTIONS = 52;
const WHAT_DOES_QUESTION_START = 25;
const WHAT_DOES_QUESTION_END = 32;

const KNOWN_ENGLISH_TRANSLATIONS = [
  "computer",
  "computers",
  "office",
  "offices",
  "paper",
  "papers",
  "employee",
  "employees",
  "director",
  "directors",
  "student",
  "students",
  "conference room",
  "classroom",
  "it means",
  "means",
];

function isWhatDoesQuestion(questionIndex: number): boolean {
  return (
    questionIndex >= WHAT_DOES_QUESTION_START &&
    questionIndex <= WHAT_DOES_QUESTION_END
  );
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?¿¡"]/g, "")
    .trim();
}

function validateStudentGrammar(text: string): {
  isValid: boolean;
  feedback?: string;
} {
  const t = text.toLowerCase();
  const forbidden = ["don't", "can't", "won't", "it's", "i'm"];
  const found = forbidden.find((c) => t.includes(c));
  if (found) {
    return {
      isValid: false,
      feedback:
        "No uses contracciones. Por favor, di la forma completa (ejemplo: 'do not' en lugar de 'don't').",
    };
  }
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

function looksLikeEnglish(text: string): boolean {
  const trimmed = normalize(text);
  if (trimmed.length < 2) return false;
  const spanishChars = /[áéíóúñü¿¡]/;
  if (spanishChars.test(text)) return false;
  return KNOWN_ENGLISH_TRANSLATIONS.some((word) => trimmed.includes(word));
}

export function useSimpleConversation(): UseSimpleConversationReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [lessonProgress, setLessonProgress] = useState<LessonState>({
    globalQuestionIndex: 1,
    correctCount: 0,
    incorrectCount: 0,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const simpleSessionIdRef = useRef<string | null>(null);
  const lessonStateRef = useRef<LessonState>({
    globalQuestionIndex: 1,
    correctCount: 0,
    incorrectCount: 0,
  });

  // REFS DE CONTROL DE FLUJO
  const isResettingRef = useRef<boolean>(false);
  const canAdvanceRef = useRef<boolean>(true);
  const isProcessingRef = useRef<boolean>(false);
  const expectingResponseRef = useRef<boolean>(false); // 🔒 EL SEMÁFORO

  const saveMessageToBackend = async (
    role: "user" | "assistant",
    content: string,
  ) => {
    if (!sessionIdRef.current || !content.trim()) return;
    try {
      if (globalThis.__supabaseInitPromise)
        await globalThis.__supabaseInitPromise;
      const supabase = globalThis.__supabaseClient;
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/ai-sessions/${sessionIdRef.current}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role, content }),
      });
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  const closeRealtimeConnection = useCallback(
    async (keepDbSession: boolean = false) => {
      if (dcRef.current) {
        try {
          dcRef.current.close();
        } catch {}
        dcRef.current = null;
      }
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioRef.current) audioRef.current.srcObject = null;
      if (!keepDbSession && sessionIdRef.current) {
        try {
          if (globalThis.__supabaseInitPromise)
            await globalThis.__supabaseInitPromise;
          const supabase = globalThis.__supabaseClient;
          if (supabase) {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.access_token) {
              await fetch(`/api/ai-sessions/${sessionIdRef.current}/end`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  "Content-Type": "application/json",
                },
              });
            }
          }
        } catch (error) {
          console.error("Error ending session:", error);
        }
      }
      simpleSessionIdRef.current = null;
    },
    [],
  );

  const createRealtimeSession = useCallback(
    async (initialQuestionIndex: number): Promise<string | null> => {
      try {
        const tokenRes = await fetch(
          `/api/assistant/simple-session?initialQuestionIndex=${initialQuestionIndex}`,
        );
        const tokenData = await tokenRes.json();
        const { token, sessionId: simpleSessionId } = tokenData;
        if (simpleSessionId) simpleSessionIdRef.current = simpleSessionId;

        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioRef.current = audioEl;
        pc.ontrack = (e) => {
          audioEl.srcObject = e.streams[0];
        };

        const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = ms;
        ms.getTracks().forEach((track) => pc.addTrack(track, ms));

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;

        return new Promise((resolve) => {
          dc.addEventListener("open", () => {
            setTimeout(() => {
              dc.send(JSON.stringify({ type: "response.create" }));
            }, 100);
            resolve(token);
          });

          dc.addEventListener("message", (event) => {
            const data = JSON.parse(event.data);

            // --- EVENTO 1: EL USUARIO TERMINA DE HABLAR ---
            if (
              data.type ===
              "conversation.item.input_audio_transcription.completed"
            ) {
              const text = data.transcript?.trim();
              if (!text || text.length < 2) {
                // Si es ruido, bloqueamos todo
                canAdvanceRef.current = false;
                expectingResponseRef.current = false; // 🔒 Semáforo en ROJO
                return;
              }

              const currentIndex = lessonStateRef.current.globalQuestionIndex;
              const grammar = validateStudentGrammar(text);

              if (!grammar.isValid) {
                canAdvanceRef.current = false;
                expectingResponseRef.current = false; // 🔒 Semáforo en ROJO (Va a corregir, no avanzar)
                dc.send(
                  JSON.stringify({
                    type: "response.create",
                    response: {
                      instructions: `Error: "${text}". Feedback: ${grammar.feedback}. Execute CORRECTION ALGORITHM.`,
                    },
                  }),
                );
                return;
              }

              if (isWhatDoesQuestion(currentIndex) && looksLikeEnglish(text)) {
                canAdvanceRef.current = false;
                expectingResponseRef.current = false; // 🔒 Semáforo en ROJO
                dc.send(
                  JSON.stringify({
                    type: "response.create",
                    response: {
                      instructions: `Error: Answered in English. Tell student to translate to Spanish and repeat question.`,
                    },
                  }),
                );
                return;
              }

              // ✅ Si llegamos acá, la respuesta es válida
              canAdvanceRef.current = true;
              expectingResponseRef.current = true; // 🔓 SEMÁFORO EN VERDE (Esperamos que la IA responda para avanzar)

              setMessages((prev) => [
                ...prev,
                {
                  id: `u-${Date.now()}`,
                  role: "user",
                  text,
                  timestamp: Date.now(),
                },
              ]);
              saveMessageToBackend("user", text);
            }

            // --- EVENTO 2: LA IA TERMINA DE HABLAR ---
            if (data.type === "response.audio_transcript.done") {
              const aiText = data.transcript?.trim();
              if (!aiText || isResettingRef.current) return;

              // 🛑 AQUÍ ESTÁ EL FIX DEL "JUMPING"
              // Solo procesamos el avance si el semáforo estaba en VERDE
              if (expectingResponseRef.current) {
                handleAiResponse(aiText);
                expectingResponseRef.current = false; // 🔒 Volvemos a poner en ROJO hasta que el usuario hable de nuevo
              } else {
                // Si el semáforo estaba en rojo, solo guardamos el mensaje pero NO AVANZAMOS
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `a-${Date.now()}`,
                    role: "assistant",
                    text: aiText,
                    timestamp: Date.now(),
                  },
                ]);
              }
            }
          });

          pc.createOffer().then(async (offer) => {
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
          });
        });
      } catch (error) {
        console.error(error);
        throw error;
      }
    },
    [closeRealtimeConnection, saveMessageToBackend],
  );

  const handleAiResponse = async (aiTranscript: string) => {
    // Protección doble: si no hay sesión o ya estamos procesando, salir
    if (!simpleSessionIdRef.current || isProcessingRef.current) return;

    isProcessingRef.current = true;
    try {
      const response = await fetch(
        `/api/assistant/simple-session/${simpleSessionIdRef.current}/process-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiTranscript }),
        },
      );

      const result = await response.json();

      if (canAdvanceRef.current && result.advanced) {
        const newIndex = result.currentIndex;
        lessonStateRef.current.globalQuestionIndex = newIndex;
        lessonStateRef.current.correctCount += 1;
        setLessonProgress({ ...lessonStateRef.current });

        // AVISAR A OPENAI QUE CAMBIAMOS DE PREGUNTA
        if (dcRef.current && dcRef.current.readyState === "open") {
          dcRef.current.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: `STRICT ORDER: You are on question ${newIndex}. Ask ONLY: "${result.currentQuestion}". No small talk.`,
              },
            }),
          );
          setTimeout(() => {
            dcRef.current?.send(JSON.stringify({ type: "response.create" }));
          }, 50);
        }

        if (newIndex > TOTAL_QUESTIONS) return;
        if (newIndex > 1 && (newIndex - 1) % QUESTION_BLOCK_SIZE === 0) {
          await resetRealtimeSession(newIndex);
          return;
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: aiTranscript,
          timestamp: Date.now(),
        },
      ]);
      saveMessageToBackend("assistant", aiTranscript);
    } catch (error) {
      console.error(error);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const resetRealtimeSession = async (targetQuestionIndex: number) => {
    if (isResettingRef.current) return;
    isResettingRef.current = true;
    try {
      await closeRealtimeConnection(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await createRealtimeSession(targetQuestionIndex);
    } catch (error) {
      console.error(error);
      setConnectionState("error");
    } finally {
      isResettingRef.current = false;
    }
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage("");
      setMessages([]);
      lessonStateRef.current = {
        globalQuestionIndex: 1,
        correctCount: 0,
        incorrectCount: 0,
      };
      setLessonProgress({ ...lessonStateRef.current });
      if (globalThis.__supabaseInitPromise)
        await globalThis.__supabaseInitPromise;
      const supabase = globalThis.__supabaseClient;
      if (!supabase) throw new Error("Supabase not initialized");
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("No auth session");
      const createSessionRes = await fetch("/api/ai-sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lesson_number: 0 }),
      });
      if (createSessionRes.ok) {
        const sessionData = await createSessionRes.json();
        sessionIdRef.current = sessionData.id;
      }
      await createRealtimeSession(1);
      setConnectionState("active");
    } catch (error: any) {
      setErrorMessage(error.message);
      setConnectionState("error");
    }
  };

  const stopConversation = async () => {
    await closeRealtimeConnection(false);
    sessionIdRef.current = null;
    lessonStateRef.current = {
      globalQuestionIndex: 1,
      correctCount: 0,
      incorrectCount: 0,
    };
    setLessonProgress({ ...lessonStateRef.current });
    setConnectionState((prev) => (prev === "error" ? "error" : "ended"));
  };

  useEffect(() => {
    return () => {
      closeRealtimeConnection(false).catch(console.error);
    };
  }, [closeRealtimeConnection]);

  return {
    connectionState,
    errorMessage,
    messages,
    lessonProgress,
    startConversation,
    stopConversation,
  };
}
