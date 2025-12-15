import { useState, useRef, useEffect } from "react";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

type ExpectedAnswerType = "NAME" | "FROM" | "LIVE" | "WORK" | "LIKE" | "ANY";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

const COUNTRIES = ["argentina", "brazil", "mexico", "spain", "usa", "united states", "canada", "france", "germany", "italy", "japan", "china", "india", "australia", "uk", "england", "colombia", "chile", "peru", "venezuela"];
const CITIES = ["buenos aires", "new york", "madrid", "paris", "london", "tokyo", "beijing", "sydney", "toronto", "berlin", "rome", "barcelona", "miami", "los angeles", "chicago"];

function validateInputForLesson1(transcript: string, expected: ExpectedAnswerType): boolean {
  const t = transcript.toLowerCase().trim();
  if (!t || t.length < 2) return false;
  
  switch (expected) {
    case "NAME":
      return t.includes("name is") || t.includes("i am") || t.includes("i'm") || (t.split(/\s+/).length <= 3);
    case "FROM":
      return t.includes("from") || t.includes("i am from") || COUNTRIES.some(c => t.includes(c));
    case "LIVE":
      return t.includes("live") || t.includes("i live") || CITIES.some(c => t.includes(c));
    case "WORK":
      return t.includes("work") || t.includes("i work") || t.includes("office") || t.includes("company") || t.includes("home");
    case "LIKE":
      return t.includes("like") || t.includes("i like") || t.includes("don't like") || t.includes("food") || t.includes("music") || t.includes("movies");
    case "ANY":
      return true;
    default:
      return true;
  }
}

function detectExpectedAnswerFromAssistant(text: string): ExpectedAnswerType {
  const t = text.toLowerCase();
  if (t.includes("what is your name") || t.includes("your name")) return "NAME";
  if (t.includes("where are you from") || t.includes("are you from")) return "FROM";
  if (t.includes("where do you live") || t.includes("do you live")) return "LIVE";
  if (t.includes("where do you work") || t.includes("do you work")) return "WORK";
  if (t.includes("what do you like") || t.includes("do you like")) return "LIKE";
  return "ANY";
}

interface UseRealtimeConversationOptions {
  lesson?: number;
}

interface UseRealtimeConversationReturn {
  connectionState: ConnectionState;
  errorMessage: string;
  messages: ConversationMessage[];
  currentLesson: number;
  startConversation: () => Promise<void>;
  stopConversation: () => Promise<void>;
  requestSessionRecap: () => void;
}

export function useRealtimeConversation(
  options: UseRealtimeConversationOptions = {},
): UseRealtimeConversationReturn {
  const { lesson = 1 } = options;

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [confirmedLesson, setConfirmedLesson] = useState<number>(lesson);

  const lessonRef = useRef<number>(lesson);
  lessonRef.current = lesson;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // 👉 guarda la última frase del usuario (NO renderiza)
  const lastUserTranscriptRef = useRef<string | null>(null);
  
  // 👉 recap flow control
  const isRecapRequestedRef = useRef<boolean>(false);
  const recapCloseScheduledRef = useRef<boolean>(false);
  
  // 👉 Voice Input Gate: track expected answer type
  const expectedAnswerRef = useRef<ExpectedAnswerType>("NAME");
  const inputRejectedRef = useRef<boolean>(false);

  useEffect(() => {
    if (
      connectionState === "idle" ||
      connectionState === "ended" ||
      connectionState === "error"
    ) {
      setConfirmedLesson(lesson);
    }
  }, [lesson, connectionState]);

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
      console.error("⚠️ Error saving message:", error);
    }
  };

  useEffect(() => {
    return () => {
      stopConversation().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopConversation = async () => {
    const sessionId = sessionIdRef.current;

    if (sessionId) {
      fetch(`/api/ai-sessions/end/${sessionId}`, { method: "POST" }).catch(
        console.error,
      );
      sessionIdRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    lastUserTranscriptRef.current = null;
    isRecapRequestedRef.current = false;
    recapCloseScheduledRef.current = false;
    expectedAnswerRef.current = "NAME";
    inputRejectedRef.current = false;

    setConnectionState((prev) => (prev === "error" ? "error" : "ended"));
  };

  const requestSessionRecap = () => {
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      console.warn("⚠️ DataChannel not open, cannot request recap");
      return;
    }

    isRecapRequestedRef.current = true;
    recapCloseScheduledRef.current = false;

    // Send system trigger to model (correct format for Realtime API)
    try {
      dcRef.current.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "END_SESSION_RECAP",
              },
            ],
          },
        })
      );
      dcRef.current.send(JSON.stringify({ type: "response.create" }));
      console.log("📋 Recap requested (correct format)");
    } catch (error) {
      console.error("⚠️ Error sending recap trigger:", error);
      isRecapRequestedRef.current = false;
    }
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage("");

      const tokenRes = await fetch(
        `/api/assistant/realtime-token?lesson=${lessonRef.current}`,
      );
      if (!tokenRes.ok) throw new Error("No se pudo obtener el token");

      const tokenData = await tokenRes.json();
      const { token, lesson: serverLesson, lessonPrompt } = tokenData;

      if (serverLesson) setConfirmedLesson(serverLesson);

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

      dc.addEventListener("open", () => {
        setConnectionState("active");
        
        // Inject lesson prompt as separate instruction message BEFORE first response
        if (lessonPrompt) {
          dc.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: `LESSON INSTRUCTIONS:\n${lessonPrompt}` }]
            }
          }));
        }
        
        dc.send(JSON.stringify({ type: "response.create" }));
      });

      dc.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);

          // 🎤 Usuario habla → Whisper transcription
          if (
            data.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            if (isRecapRequestedRef.current) {
              return;
            }
            const text = data.transcript?.trim();
            if (!text) return;
            
            // 🚧 Voice Input Gate: validate before allowing model to respond
            const isValid = validateInputForLesson1(text, expectedAnswerRef.current);
            
            if (!isValid) {
              inputRejectedRef.current = true;
              lastUserTranscriptRef.current = null;
              
              // Cancel pending model response and send fixed clarification
              try {
                dc.send(JSON.stringify({ type: "response.cancel" }));
                dc.send(JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "assistant",
                    content: [{ type: "input_text", text: "I didn't understand. Can you say it again?" }]
                  }
                }));
                dc.send(JSON.stringify({ type: "response.create" }));
              } catch {}
              return;
            }
            
            inputRejectedRef.current = false;
            lastUserTranscriptRef.current = text;
          }

          // 🤖 Respuesta final del asistente
          if (data.type === "response.audio_transcript.done") {
            const assistantText = data.transcript?.trim();
            if (!assistantText) return;

            // 👉 If recap was requested, estimate audio duration and schedule close
            if (isRecapRequestedRef.current && !recapCloseScheduledRef.current) {
              recapCloseScheduledRef.current = true;
              setMessages((prev) => [
                ...prev,
                {
                  id: data.response_id || `assistant-${Date.now()}`,
                  role: "assistant",
                  text: assistantText,
                  timestamp: Date.now(),
                },
              ]);
              saveMessageToBackend("assistant", assistantText);
              
              // Estimar duración: ~2.5 palabras/segundo = 400ms por palabra + 2s buffer
              const wordCount = assistantText.split(/\s+/).length;
              const estimatedMs = Math.max(wordCount * 400 + 2000, 5000);
              
              setTimeout(() => {
                stopConversation();
              }, estimatedMs);
              return;
            }

            // Update expected answer based on assistant's question
            expectedAnswerRef.current = detectExpectedAnswerFromAssistant(assistantText);

            const userText = lastUserTranscriptRef.current;

            // 👉 ahora sí mostramos el mensaje del usuario (confirmado)
            if (userText) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `user-${Date.now()}`,
                  role: "user",
                  text: userText,
                  timestamp: Date.now(),
                },
              ]);
              saveMessageToBackend("user", userText);
              lastUserTranscriptRef.current = null;
            }

            // 👉 mostramos la respuesta del asistente
            setMessages((prev) => [
              ...prev,
              {
                id: data.response_id || `assistant-${Date.now()}`,
                role: "assistant",
                text: assistantText,
                timestamp: Date.now(),
              },
            ]);
            saveMessageToBackend("assistant", assistantText);
          }
        } catch (e) {
          console.error("Error parsing realtime event:", e);
        }
      });

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

      const answer = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (error) {
      console.error(error);
      setErrorMessage("Error al iniciar la conversación");
      setConnectionState("error");
      stopConversation();
    }
  };

  return {
    connectionState,
    errorMessage,
    messages,
    currentLesson: confirmedLesson,
    startConversation,
    stopConversation,
    requestSessionRecap,
  };
}
