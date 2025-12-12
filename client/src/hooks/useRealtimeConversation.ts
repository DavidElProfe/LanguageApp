import { useState, useRef, useEffect } from "react";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface UseRealtimeConversationReturn {
  connectionState: ConnectionState;
  errorMessage: string;
  messages: ConversationMessage[];
  startConversation: () => Promise<void>;
  stopConversation: () => Promise<void>;
}

export function useRealtimeConversation(): UseRealtimeConversationReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Initialize Supabase on mount to ensure auth is available
  useEffect(() => {
    import("@/lib/supabase").then(({ getSupabase }) => {
      getSupabase().catch((error) => {
        console.error("Failed to initialize Supabase:", error);
      });
    });
  }, []);

  // Helper function to save message to backend (non-blocking)
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Can't use async in cleanup, so fire and forget
      stopConversation().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopConversation = async () => {
    // Capture the session ID BEFORE clearing the ref
    const sessionId = sessionIdRef.current;

    // End the AI session in the database (fire and forget)
    if (sessionId) {
      const endSession = async () => {
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

          const response = await fetch(`/api/ai-sessions/end/${sessionId}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            console.error("⚠️ Failed to update AI session end time");
          } else {
            console.log("✅ AI session ended:", sessionId);
          }
        } catch (error) {
          console.error("⚠️ Error ending AI session:", error);
        }
      };

      // Fire and forget - don't block cleanup
      endSession();
      sessionIdRef.current = null;
    }

    // Stop media stream tracks first (critical for privacy)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }

    // Close data channel
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch (e) {
        console.error("Error closing data channel:", e);
      }
      dcRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {
        console.error("Error closing peer connection:", e);
      }
      pcRef.current = null;
    }

    // Clear audio element
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    // Only set to "ended" if not already in error state
    setConnectionState((prev) => (prev === "error" ? "error" : "ended"));
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage("");

      // Start a new AI session in the database - MUST complete before messages arrive
      try {
        // Ensure Supabase is initialized
        if (globalThis.__supabaseInitPromise) {
          await globalThis.__supabaseInitPromise;
        }
        const supabase = globalThis.__supabaseClient;

        if (supabase) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            const response = await fetch("/api/ai-sessions/start", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
            });

            if (!response.ok) {
              console.error(
                "⚠️ Failed to create AI session record - conversation won't be tracked",
              );
            } else {
              const data = await response.json();
              sessionIdRef.current = data.id;
              console.log("✅ AI session started:", data.id);
            }
          } else {
            console.warn("⚠️ No auth session - conversation won't be tracked");
          }
        } else {
          console.warn(
            "⚠️ Supabase not initialized - conversation won't be tracked",
          );
        }
      } catch (error) {
        console.error(
          "⚠️ Error starting AI session - conversation won't be tracked:",
          error,
        );
      }

      // Get ephemeral token from backend
      const tokenRes = await fetch("/api/assistant/realtime-token");
      if (!tokenRes.ok) throw new Error("No se pudo obtener el token");

      const { token } = await tokenRes.json();

      // Create peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Set up audio element for receiving
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioRef.current = audioEl;

      pc.ontrack = (e) => {
        if (audioEl) {
          audioEl.srcObject = e.streams[0];
        }
      };

      // Add microphone and store the stream for cleanup
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });

      mediaStreamRef.current = ms;
      ms.getTracks().forEach((track) => pc.addTrack(track, ms));

      // Create data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        setConnectionState("active");
        // Send initial greeting trigger
        dc.send(
          JSON.stringify({
            type: "response.create",
          }),
        );
      });

      // Listen for conversation events
      dc.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle transcript events
          if (
            data.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const userMessage = data.transcript || "";
            setMessages((prev) => [
              ...prev,
              {
                id: data.item_id || `user-${Date.now()}`,
                role: "user",
                text: userMessage,
                timestamp: Date.now(),
              },
            ]);
            // Save to backend
            saveMessageToBackend("user", userMessage);
          } else if (data.type === "response.audio_transcript.done") {
            const assistantMessage = data.transcript || "";
            setMessages((prev) => [
              ...prev,
              {
                id: data.response_id || `assistant-${Date.now()}`,
                role: "assistant",
                text: assistantMessage,
                timestamp: Date.now(),
              },
            ]);
            // Save to backend
            saveMessageToBackend("assistant", assistantMessage);
          }
        } catch (e) {
          console.error("Error parsing data channel message:", e);
        }
      });

      // Create and set local offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to OpenAI and get answer
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

      if (!sdpRes.ok) throw new Error("Error al conectar con OpenAI");

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (error) {
      console.error("Error starting conversation:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al iniciar la conversación",
      );
      setConnectionState("error");
      stopConversation();
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
