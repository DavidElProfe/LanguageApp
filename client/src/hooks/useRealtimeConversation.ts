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
  stopConversation: () => void;
}

export function useRealtimeConversation(): UseRealtimeConversationReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, []);

  const stopConversation = () => {
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
          })
        );
      });

      // Listen for conversation events
      dc.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle transcript events
          if (data.type === "conversation.item.input_audio_transcription.completed") {
            setMessages((prev) => [
              ...prev,
              {
                id: data.item_id || `user-${Date.now()}`,
                role: "user",
                text: data.transcript || "",
                timestamp: Date.now(),
              },
            ]);
          } else if (data.type === "response.audio_transcript.done") {
            setMessages((prev) => [
              ...prev,
              {
                id: data.response_id || `assistant-${Date.now()}`,
                role: "assistant",
                text: data.transcript || "",
                timestamp: Date.now(),
              },
            ]);
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
        }
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
        error instanceof Error ? error.message : "Error al iniciar la conversación"
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
