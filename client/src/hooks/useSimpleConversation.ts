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
  "conference rooms",
  "meeting room",
  "meeting rooms",
  "classroom",
  "classrooms",
  "class room",
  "class rooms",
  "it means",
  "means",
];

const NEGATIVE_CONTRACTIONS = [
  "don't",
  "doesn't",
  "didn't",
  "can't",
  "won't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "haven't",
  "hasn't",
  "hadn't",
];

function containsNegativeContraction(text: string): boolean {
  const t = text.toLowerCase();
  return NEGATIVE_CONTRACTIONS.some((c) => t.includes(c));
}

function isWhatDoesQuestion(questionIndex: number): boolean {
  return (
    questionIndex >= WHAT_DOES_QUESTION_START &&
    questionIndex <= WHAT_DOES_QUESTION_END
  );
}

function looksLikeEnglish(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  if (trimmed.length < 2) {
    return false;
  }

  const spanishChars = /[áéíóúñüÁÉÍÓÚÑÜ¿¡]/;
  if (spanishChars.test(trimmed)) {
    return false;
  }

  const cleaned = trimmed.replace(/[.,!?'"]/g, "").trim();

  for (const englishWord of KNOWN_ENGLISH_TRANSLATIONS) {
    if (cleaned === englishWord) {
      return true;
    }
    if (
      cleaned.startsWith(englishWord + " ") ||
      cleaned.endsWith(" " + englishWord)
    ) {
      return true;
    }
    if (
      cleaned === "the " + englishWord ||
      cleaned === "a " + englishWord ||
      cleaned === "an " + englishWord
    ) {
      return true;
    }
  }

  return false;
}

export function useSimpleConversation(): UseSimpleConversationReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

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

  const isResettingRef = useRef<boolean>(false);

  const [lessonProgress, setLessonProgress] = useState<LessonState>({
    globalQuestionIndex: 1,
    correctCount: 0,
    incorrectCount: 0,
  });

  useEffect(() => {
    import("@/lib/supabase").then(({ getSupabase }) => {
      getSupabase().catch(console.error);
    });
  }, []);

  const saveMessageToBackend = async (
    role: "user" | "assistant",
    content: string,
  ) => {
    if (!sessionIdRef.current || !content.trim()) return;

    try {
      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }

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

      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }

      if (!keepDbSession && sessionIdRef.current) {
        try {
          if (globalThis.__supabaseInitPromise) {
            await globalThis.__supabaseInitPromise;
          }

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
        if (!tokenRes.ok) {
          throw new Error("Failed to get session token");
        }

        const tokenData = await tokenRes.json();
        const {
          token,
          sessionId: simpleSessionId,
          currentQuestionIndex,
        } = tokenData;

        if (simpleSessionId) {
          simpleSessionIdRef.current = simpleSessionId;
          console.log(
            `[BlockReset] Created backend session ${simpleSessionId} at question ${currentQuestionIndex}`,
          );
        }

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

        return new Promise((resolve, reject) => {
          dc.addEventListener("open", async () => {
            console.log(
              `[BlockReset] DataChannel open, sending response.create`,
            );

            setTimeout(() => {
              dc.send(JSON.stringify({ type: "response.create" }));
            }, 100);

            resolve(token);
          });

          dc.addEventListener("message", (event) => {
            try {
              const data = JSON.parse(event.data);

              if (
                data.type ===
                "conversation.item.input_audio_transcription.completed"
              ) {
                const text = data.transcript?.trim();
                console.log("🔥 STUDENT TRANSCRIPT RECEIVED:", text);
                if (!text) return;

                const currentIndex = lessonStateRef.current.globalQuestionIndex;

                // ❌ BLOQUEAR CONTRACCIONES EN NIVEL 1
                if (containsNegativeContraction(text)) {
                  console.log(
                    `🚫 [Grammar] Contraction not allowed: "${text}"`,
                  );

                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `user-${Date.now()}`,
                      role: "user",
                      text: text,
                      timestamp: Date.now(),
                    },
                    {
                      id: `correction-${Date.now()}`,
                      role: "assistant",
                      text: "En este nivel no usamos contracciones. Di: “I do not …”",
                      timestamp: Date.now(),
                    },
                  ]);

                  return; // ⛔ CLAVE: acá se corta todo
                }

                if (
                  isWhatDoesQuestion(currentIndex) &&
                  looksLikeEnglish(text)
                ) {
                  console.log(
                    `🚫 [Guardrail] English detected for P${currentIndex}: "${text}"`,
                  );

                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `user-${Date.now()}`,
                      role: "user",
                      text: text,
                      timestamp: Date.now(),
                    },
                    {
                      id: `correction-${Date.now()}`,
                      role: "assistant",
                      text: "Recuerda: para las preguntas '¿Qué significa...?', responde en español. Intenta de nuevo.",
                      timestamp: Date.now(),
                    },
                  ]);
                  return;
                }

                setMessages((prev) => [
                  ...prev,
                  {
                    id: `user-${Date.now()}`,
                    role: "user",
                    text: text,
                    timestamp: Date.now(),
                  },
                ]);
                saveMessageToBackend("user", text);
              }

              if (data.type === "response.audio_transcript.done") {
                const text = data.transcript?.trim();
                if (!text) return;

                if (isResettingRef.current) {
                  console.log(
                    `[BlockReset] Ignoring response during reset: "${text.substring(0, 50)}..."`,
                  );
                  return;
                }

                handleAiResponse(text);
              }

              if (data.type === "error") {
                console.error("Realtime error:", data.error);
                setErrorMessage(data.error?.message || "An error occurred");
              }
            } catch (err) {
              console.error("Error parsing message:", err);
            }
          });

          dc.addEventListener("close", () => {
            if (!isResettingRef.current) {
              setConnectionState("ended");
            }
          });

          pc.createOffer()
            .then(async (offer) => {
              await pc.setLocalDescription(offer);

              const sdpRes = await fetch(
                "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/sdp",
                  },
                  body: offer.sdp,
                },
              );

              if (!sdpRes.ok) {
                throw new Error("Failed to establish WebRTC connection");
              }

              const answer: RTCSessionDescriptionInit = {
                type: "answer",
                sdp: await sdpRes.text(),
              };
              await pc.setRemoteDescription(answer);
            })
            .catch(reject);
        });
      } catch (error) {
        console.error("Error creating realtime session:", error);
        throw error;
      }
    },
    [],
  );

  const handleAiResponse = async (aiTranscript: string) => {
    if (!simpleSessionIdRef.current || !aiTranscript.trim()) return;

    try {
      const response = await fetch(
        `/api/assistant/simple-session/${simpleSessionIdRef.current}/process-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiTranscript }),
        },
      );

      if (response.ok) {
        const result = await response.json();

        if (result.advanced) {
          const newIndex = result.currentIndex;
          console.log(`[BlockReset] Advanced to question ${newIndex}`);

          lessonStateRef.current.globalQuestionIndex = newIndex;
          lessonStateRef.current.correctCount += 1;
          setLessonProgress({ ...lessonStateRef.current });

          if (newIndex > TOTAL_QUESTIONS) {
            console.log(`[BlockReset] Lesson complete!`);
            setMessages((prev) => [
              ...prev,
              {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                text: aiTranscript,
                timestamp: Date.now(),
              },
            ]);
            saveMessageToBackend("assistant", aiTranscript);
            return;
          }

          const isBlockBoundary =
            newIndex > 1 && (newIndex - 1) % QUESTION_BLOCK_SIZE === 0;

          if (isBlockBoundary) {
            console.log(
              `[BlockReset] Block boundary at Q${newIndex} - discarding old context response, resetting NOW`,
            );
            await resetRealtimeSession(newIndex);
            return;
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: aiTranscript,
            timestamp: Date.now(),
          },
        ]);
        saveMessageToBackend("assistant", aiTranscript);
      }
    } catch (error) {
      console.error("Error processing AI response:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: aiTranscript,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const resetRealtimeSession = async (targetQuestionIndex: number) => {
    if (isResettingRef.current) {
      console.log(`[BlockReset] Already resetting, skipping`);
      return;
    }

    isResettingRef.current = true;
    console.log(
      `[BlockReset] Starting session reset for question ${targetQuestionIndex}`,
    );

    try {
      await closeRealtimeConnection(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await createRealtimeSession(targetQuestionIndex);

      console.log(
        `[BlockReset] Session reset complete, now at question ${targetQuestionIndex}`,
      );
    } catch (error) {
      console.error("[BlockReset] Error during session reset:", error);
      setErrorMessage("Error resetting session. Please try again.");
      setConnectionState("error");
    } finally {
      isResettingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      closeRealtimeConnection(false).catch(console.error);
    };
  }, [closeRealtimeConnection]);

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

      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }

      const supabase = globalThis.__supabaseClient;
      if (!supabase) {
        throw new Error("Supabase not initialized");
      }

      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        throw new Error("No authentication session found");
      }

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
      console.error("Error starting conversation:", error);
      setErrorMessage(error.message || "Failed to start conversation");
      setConnectionState("error");
    }
  };

  return {
    connectionState,
    errorMessage,
    messages,
    lessonProgress,
    startConversation,
    stopConversation,
  };
}
