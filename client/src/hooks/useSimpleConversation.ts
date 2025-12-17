import { useState, useRef, useEffect } from "react";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

const WHAT_DOES_QUESTION_START = 25;
const WHAT_DOES_QUESTION_END = 32;

const KNOWN_ENGLISH_TRANSLATIONS = [
  'computer', 'computers',
  'office', 'offices', 
  'paper', 'papers',
  'employee', 'employees',
  'director', 'directors',
  'student', 'students',
  'conference room', 'conference rooms', 'meeting room', 'meeting rooms',
  'classroom', 'classrooms', 'class room', 'class rooms',
  'it means', 'means', 'the', 'a', 'an',
];

function isWhatDoesQuestion(questionIndex: number): boolean {
  return questionIndex >= WHAT_DOES_QUESTION_START && questionIndex <= WHAT_DOES_QUESTION_END;
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
  
  const cleaned = trimmed.replace(/[.,!?'"]/g, '').trim();
  
  for (const englishWord of KNOWN_ENGLISH_TRANSLATIONS) {
    if (cleaned === englishWord) {
      return true;
    }
    if (cleaned.startsWith(englishWord + ' ') || cleaned.endsWith(' ' + englishWord)) {
      return true;
    }
    if (cleaned === 'the ' + englishWord || cleaned === 'a ' + englishWord || cleaned === 'an ' + englishWord) {
      return true;
    }
  }
  
  return false;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface UseSimpleConversationReturn {
  connectionState: ConnectionState;
  errorMessage: string;
  messages: ConversationMessage[];
  startConversation: () => Promise<void>;
  stopConversation: () => Promise<void>;
}

export function useSimpleConversation(): UseSimpleConversationReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const simpleSessionIdRef = useRef<string | null>(null);
  const currentQuestionIndexRef = useRef<number>(0);

  useEffect(() => {
    import("@/lib/supabase").then(({ getSupabase }) => {
      getSupabase().catch(console.error);
    });
  }, []);

  const saveMessageToBackend = async (role: "user" | "assistant", content: string) => {
    if (!sessionIdRef.current || !content.trim()) return;

    try {
      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }

      const supabase = globalThis.__supabaseClient;
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
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

  const processAiResponse = async (aiTranscript: string) => {
    if (!simpleSessionIdRef.current || !aiTranscript.trim()) return;

    try {
      const response = await fetch(
        `/api/assistant/simple-session/${simpleSessionIdRef.current}/process-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiTranscript }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.advanced) {
          console.log(`[SimpleConversation] Advanced to question ${result.currentIndex}`);
          currentQuestionIndexRef.current = result.currentIndex;
        }
      }
    } catch (error) {
      console.error("Error processing AI response:", error);
    }
  };

  useEffect(() => {
    return () => {
      stopConversation().catch(console.error);
    };
  }, []);

  const stopConversation = async () => {
    const sessionId = sessionIdRef.current;

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

    if (sessionId) {
      try {
        if (globalThis.__supabaseInitPromise) {
          await globalThis.__supabaseInitPromise;
        }

        const supabase = globalThis.__supabaseClient;
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            await fetch(`/api/ai-sessions/${sessionId}/end`, {
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

    sessionIdRef.current = null;
    simpleSessionIdRef.current = null;
    currentQuestionIndexRef.current = 0;
    setConnectionState((prev) => (prev === "error" ? "error" : "ended"));
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage("");
      setMessages([]);

      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }

      const supabase = globalThis.__supabaseClient;
      if (!supabase) {
        throw new Error("Supabase not initialized");
      }

      const { data: { session: authSession } } = await supabase.auth.getSession();
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

      const tokenRes = await fetch("/api/assistant/simple-session");
      if (!tokenRes.ok) {
        throw new Error("Failed to get session token");
      }

      const tokenData = await tokenRes.json();
      const { token, instructionsIncluded, sessionId: simpleSessionId, currentQuestionIndex } = tokenData;
      
      if (simpleSessionId) {
        simpleSessionIdRef.current = simpleSessionId;
        currentQuestionIndexRef.current = currentQuestionIndex ?? 0;
        console.log(`[SimpleConversation] Backend session ${simpleSessionId} at question ${currentQuestionIndex}`);
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

      dc.addEventListener("open", () => {
        setConnectionState("active");
        
        if (instructionsIncluded) {
          console.log("Instructions already in token, skipping session.update");
        }
        
        setTimeout(() => {
          dc.send(JSON.stringify({ type: "response.create" }));
        }, 100);
      });

      dc.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "conversation.item.input_audio_transcription.completed") {
            const text = data.transcript?.trim();
            console.log("🔥 STUDENT TRANSCRIPT RECEIVED:", text);
            if (!text) return;

            const currentQuestionIndex = currentQuestionIndexRef.current;
            
            if (isWhatDoesQuestion(currentQuestionIndex) && looksLikeEnglish(text)) {
              console.log(`🚫 [Guardrail] English detected for P${currentQuestionIndex}: "${text}"`);
              
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
                  text: "Recuerda: para las preguntas '¿Qué significa...?', responde en español. Por ejemplo, 'computer' significa 'computadora'. Intenta de nuevo en español.",
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

            setMessages((prev) => [
              ...prev,
              {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                text: text,
                timestamp: Date.now(),
              },
            ]);
            saveMessageToBackend("assistant", text);
            processAiResponse(text);
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
        setConnectionState("ended");
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
          },
          body: offer.sdp,
        }
      );

      if (!sdpRes.ok) {
        throw new Error("Failed to establish WebRTC connection");
      }

      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpRes.text(),
      };
      await pc.setRemoteDescription(answer);
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
    startConversation,
    stopConversation,
  };
}
