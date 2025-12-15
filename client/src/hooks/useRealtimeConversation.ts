import { useState, useRef, useEffect } from "react";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

type Lesson1Step = "NAME" | "FROM" | "LIVE" | "WORK" | "LIKE" | "DONE";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

const STEP_ORDER: Lesson1Step[] = ["NAME", "FROM", "LIVE", "WORK", "LIKE", "DONE"];

function getNextStep(current: Lesson1Step): Lesson1Step {
  const idx = STEP_ORDER.indexOf(current);
  if (idx === -1 || idx >= STEP_ORDER.length - 1) return "DONE";
  return STEP_ORDER[idx + 1];
}

function isCorrectAnswer(transcript: string, step: Lesson1Step): boolean {
  const t = transcript.toLowerCase().trim();
  if (!t || t.length < 2) return false;
  
  switch (step) {
    case "NAME":
      return t.includes("my name is") || t.includes("i am") || t.includes("i'm");
    case "FROM":
      return t.includes("i am from") || t.includes("i'm from");
    case "LIVE":
      return t.includes("i live in") || t.includes("i live");
    case "WORK":
      return t.includes("i work in") || t.includes("i work at") || t.includes("i work");
    case "LIKE":
      return t.includes("i like") || t.includes("i don't like");
    default:
      return false;
  }
}

function isValidInput(transcript: string, step: Lesson1Step): boolean {
  const t = transcript.toLowerCase().trim();
  if (!t || t.length < 2) return false;
  
  switch (step) {
    case "NAME":
      return t.includes("name") || t.includes("i am") || t.includes("i'm") || (t.split(/\s+/).length <= 3);
    case "FROM":
      return t.includes("from") || t.includes("argentina") || t.includes("mexico") || t.includes("spain") || t.includes("usa") || t.includes("brazil");
    case "LIVE":
      return t.includes("live") || t.includes("buenos aires") || t.includes("new york") || t.includes("madrid");
    case "WORK":
      return t.includes("work") || t.includes("office") || t.includes("company") || t.includes("home");
    case "LIKE":
      return t.includes("like") || t.includes("food") || t.includes("music") || t.includes("movies");
    default:
      return true;
  }
}


interface UseRealtimeConversationOptions {
  lesson?: number;
}

interface UseRealtimeConversationReturn {
  connectionState: ConnectionState;
  errorMessage: string;
  messages: ConversationMessage[];
  currentLesson: number;
  currentStep: Lesson1Step;
  startConversation: () => Promise<void>;
  stopConversation: () => Promise<void>;
  requestSessionRecap: () => void;
}

export function useRealtimeConversation(
  options: UseRealtimeConversationOptions = {},
): UseRealtimeConversationReturn {
  const { lesson = 1 } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [confirmedLesson, setConfirmedLesson] = useState<number>(lesson);
  const [currentStep, setCurrentStep] = useState<Lesson1Step>("NAME");

  const lessonRef = useRef<number>(lesson);
  lessonRef.current = lesson;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const lastUserTranscriptRef = useRef<string | null>(null);
  const isRecapRequestedRef = useRef<boolean>(false);
  const recapCloseScheduledRef = useRef<boolean>(false);
  
  const currentStepRef = useRef<Lesson1Step>("NAME");
  const isStepBasedRef = useRef<boolean>(false);
  const stepAdvancePendingRef = useRef<boolean>(false);
  const stepInjectedRef = useRef<boolean>(false);
  const canModelSpeakRef = useRef<boolean>(false);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (connectionState === "idle" || connectionState === "ended" || connectionState === "error") {
      setConfirmedLesson(lesson);
      setCurrentStep("NAME");
    }
  }, [lesson, connectionState]);

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

  useEffect(() => {
    return () => {
      stopConversation().catch(console.error);
    };
  }, []);

  const advanceToNextStep = async () => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open" || !isStepBasedRef.current) return;
    
    if (stepAdvancePendingRef.current === false) return;
    
    const nextStep = getNextStep(currentStepRef.current);
    console.log(`📍 Advancing from ${currentStepRef.current} to ${nextStep}`);
    
    if (nextStep === "DONE") {
      setCurrentStep("DONE");
      currentStepRef.current = "DONE";
      stepAdvancePendingRef.current = false;
      stepInjectedRef.current = false;
      canModelSpeakRef.current = false;
      return;
    }

    try {
      const res = await fetch(`/api/assistant/lesson1-step?step=${nextStep}`);
      const data = await res.json();
      
      dc.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "input_text", text: data.stepPrompt }]
        }
      }));
      
      stepInjectedRef.current = true;
      canModelSpeakRef.current = true;
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (stepInjectedRef.current && currentStepRef.current !== "DONE") {
        dc.send(JSON.stringify({ type: "response.create" }));
        canModelSpeakRef.current = false;
      }
      
      setCurrentStep(nextStep);
      currentStepRef.current = nextStep;
      stepAdvancePendingRef.current = false;
    } catch (error) {
      console.error("Error advancing step:", error);
      stepAdvancePendingRef.current = false;
    }
  };

  const stopConversation = async () => {
    const sessionId = sessionIdRef.current;

    if (sessionId) {
      fetch(`/api/ai-sessions/end/${sessionId}`, { method: "POST" }).catch(console.error);
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
      audioRef.current.remove();
      audioRef.current = null;
    }

    lastUserTranscriptRef.current = null;
    isRecapRequestedRef.current = false;
    recapCloseScheduledRef.current = false;
    currentStepRef.current = "NAME";
    isStepBasedRef.current = false;
    stepAdvancePendingRef.current = false;
    stepInjectedRef.current = false;
    canModelSpeakRef.current = false;

    setConnectionState((prev) => (prev === "error" ? "error" : "ended"));
  };

  const requestSessionRecap = () => {
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      console.warn("DataChannel not open, cannot request recap");
      return;
    }

    isRecapRequestedRef.current = true;
    recapCloseScheduledRef.current = false;

    try {
      dcRef.current.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "END_SESSION_RECAP" }],
          },
        })
      );
      dcRef.current.send(JSON.stringify({ type: "response.create" }));
      console.log("Recap requested");
    } catch (error) {
      console.error("Error sending recap trigger:", error);
      isRecapRequestedRef.current = false;
    }
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage("");
      setCurrentStep("NAME");
      currentStepRef.current = "NAME";

      const tokenRes = await fetch(`/api/assistant/simple-session`);
      if (!tokenRes.ok) throw new Error("No se pudo obtener el token");

      const tokenData = await tokenRes.json();
      const { token, fullInstructions } = tokenData;

      isStepBasedRef.current = false;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
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
        console.log("DataChannel OPEN");
        setConnectionState("active");
        
        if (fullInstructions) {
          console.log("Sending session.update with instructions");
          dc.send(JSON.stringify({
            type: "session.update",
            session: { instructions: fullInstructions }
          }));
        }
        
        setTimeout(() => {
          console.log("Sending response.create to trigger AI");
          dc.send(JSON.stringify({ type: "response.create" }));
        }, 100);
      });
      
      dc.addEventListener("error", (e) => {
        console.error("DataChannel ERROR:", e);
      });
      
      dc.addEventListener("close", () => {
        console.log("DataChannel CLOSED");
      });

      dc.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Log all events from OpenAI for debugging
          if (data.type) {
            console.log("OpenAI event:", data.type);
          }

          if (data.type === "conversation.item.input_audio_transcription.completed") {
            if (isRecapRequestedRef.current) return;
            
            const text = data.transcript?.trim();
            if (!text) return;
            
            if (isStepBasedRef.current) {
              const step = currentStepRef.current;
              
              if (step === "DONE") {
                lastUserTranscriptRef.current = null;
                try {
                  dc.send(JSON.stringify({ type: "response.cancel" }));
                } catch {}
                return;
              }
              
              if (!isValidInput(text, step)) {
                lastUserTranscriptRef.current = null;
                
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `user-${Date.now()}`,
                    role: "user",
                    text: text,
                    timestamp: Date.now(),
                  },
                  {
                    id: `assistant-invalid-${Date.now()}`,
                    role: "assistant",
                    text: "I didn't understand. Can you say it again?",
                    timestamp: Date.now(),
                  },
                ]);
                
                try {
                  dc.send(JSON.stringify({ type: "response.cancel" }));
                } catch {}
                return;
              }
              
              if (isCorrectAnswer(text, step)) {
                stepAdvancePendingRef.current = true;
              }
            }
            
            lastUserTranscriptRef.current = text;
          }

          if (data.type === "response.audio_transcript.done") {
            const assistantText = data.transcript?.trim();
            if (!assistantText) return;

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
              
              const wordCount = assistantText.split(/\s+/).length;
              const estimatedMs = Math.max(wordCount * 400 + 2000, 5000);
              
              setTimeout(() => {
                stopConversation();
              }, estimatedMs);
              return;
            }

            const userText = lastUserTranscriptRef.current;

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

            if (isStepBasedRef.current && stepAdvancePendingRef.current) {
              if (!assistantText.toLowerCase().includes("say it")) {
                setTimeout(() => {
                  advanceToNextStep();
                }, 500);
              } else {
                stepAdvancePendingRef.current = false;
              }
            }
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
    currentStep,
    startConversation,
    stopConversation,
    requestSessionRecap,
  };
}
