import { useState, useRef, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mic, Square, ChevronLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type ConversationStatus = "idle" | "connecting" | "active" | "ended" | "error";

function useRealtimeConversation(activityId: string) {
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const { toast } = useToast();

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const startConversation = async () => {
    try {
      setStatus("connecting");
      setErrorMessage("");

      // Fetch ephemeral token
      const tokenRes = await fetch("/api/assistant/realtime-token");
      if (!tokenRes.ok) throw new Error("No se pudo obtener el token de sesión");
      const { token } = await tokenRes.json();

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      localStreamRef.current = stream;

      // Create peer connection
      const pc = new RTCPeerConnection();
      peerRef.current = pc;

      // Add local audio track
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create data channel for messages
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      // Handle data channel open - send greeting trigger
      dc.onopen = () => {
        console.log("Data channel opened");
        // Send initial message to trigger assistant greeting
        dc.send(
          JSON.stringify({
            type: "response.create",
          })
        );
      };

      // Handle incoming messages
      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("Received message:", message.type);
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      };

      // Handle remote audio
      pc.ontrack = (event) => {
        if (!remoteAudioRef.current) {
          remoteAudioRef.current = new Audio();
          remoteAudioRef.current.autoplay = true;
        }
        remoteAudioRef.current.srcObject = event.streams[0];
      };

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log("Connection state:", state);
        if (state === "connected") {
          setStatus("active");
        } else if (state === "failed" || state === "disconnected") {
          stopConversation();
          setStatus("error");
          setErrorMessage("La conexión se perdió");
        }
      };

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

      console.log("WebRTC connection established");
    } catch (error: any) {
      console.error("Error starting conversation:", error);
      setStatus("error");
      setErrorMessage(error.message || "Error al iniciar conversación");
      toast({
        title: "Error",
        description: error.message || "No se pudo iniciar la conversación",
        variant: "destructive",
      });
      stopConversation();
    }
  };

  const stopConversation = () => {
    // Stop local tracks
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    // Close data channel
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    // Close peer connection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    // Stop remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    if (status === "active") {
      setStatus("ended");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, []);

  return {
    status,
    errorMessage,
    startConversation,
    stopConversation,
  };
}

export default function AIChatActivity() {
  const [, params] = useRoute(
    "/courses/:courseId/lessons/:lessonId/topics/:topicId/chat"
  );
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: course, isLoading } = useQuery({
    queryKey: ["/api/courses", params?.courseId],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${params?.courseId}`);
      return res.json();
    },
  });

  const { data: completions = [] } = useQuery({
    queryKey: ["/api/completions"],
    queryFn: async () => {
      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }
      const client = globalThis.__supabaseClient;
      const token = client
        ? (await client.auth.getSession()).data.session?.access_token
        : "";
      const res = await fetch("/api/completions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!user,
  });

  const lesson = course?.lessons?.find((l: any) => l.id === params?.lessonId);
  const topic = lesson?.topics?.find((t: any) => t.id === params?.topicId);
  const chatActivity = topic?.activities?.find((a: any) => a.type === "chat");

  const { status, errorMessage, startConversation, stopConversation } =
    useRealtimeConversation(chatActivity?.id || "");

  const completeActivity = useMutation({
    mutationFn: async (activityId: string) => {
      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }
      const client = globalThis.__supabaseClient;
      const token = client
        ? (await client.auth.getSession()).data.session?.access_token
        : "";
      const res = await fetch(`/api/activities/${activityId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/completions"] });
    },
  });

  const completedIds = new Set(
    (Array.isArray(completions) ? completions : []).map((c: any) => c.activityId)
  );
  const isActivityComplete = chatActivity?.id
    ? completedIds.has(chatActivity.id)
    : false;

  const handleStopAndComplete = async () => {
    stopConversation();

    if (!user) {
      toast({
        title: "Por favor inicia sesión",
        description: "Inicia sesión para guardar tu progreso",
      });
      setLocation("/auth");
      return;
    }

    if (!isActivityComplete && chatActivity?.id) {
      try {
        await completeActivity.mutateAsync(chatActivity.id);
        toast({
          title: "¡Excelente!",
          description: "Conversación completada",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: "No se pudo guardar el progreso",
          variant: "destructive",
        });
      }
    }

    // Navigate back to topic
    setLocation(
      `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}`
    );
  };

  if (isLoading || !course) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center py-12">Cargando...</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!lesson || !topic || !chatActivity) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center py-12">Actividad no encontrada</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const getStatusText = () => {
    switch (status) {
      case "idle":
        return "Presiona el botón para empezar a practicar";
      case "connecting":
        return "Conectando...";
      case "active":
        return "Conversación activa - Habla con tu asistente de IA";
      case "ended":
        return "Conversación terminada";
      case "error":
        return errorMessage || "Error en la conexión";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Button
            variant="ghost"
            onClick={() =>
              setLocation(
                `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}`
              )
            }
            className="mb-6"
            data-testid="button-back"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Volver al tema
          </Button>

          <Card>
            <CardHeader>
              <CardTitle data-testid="text-activity-title">
                Actividad 3: Conversar con IA
              </CardTitle>
              <CardDescription data-testid="text-topic-title">
                {topic.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center py-8">
                <div
                  className="text-6xl mb-4"
                  role="img"
                  aria-label="Conversation"
                >
                  💬
                </div>
                <p
                  className="text-lg font-medium mb-2"
                  data-testid="text-status"
                >
                  {getStatusText()}
                </p>
                {isActivityComplete && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    ✓ Actividad completada
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {status === "idle" && (
                  <Button
                    onClick={startConversation}
                    size="lg"
                    className="gap-2"
                    data-testid="button-start-conversation"
                  >
                    <Mic className="h-5 w-5" />
                    🎤 Empezar conversación
                  </Button>
                )}

                {(status === "connecting" ||
                  status === "active" ||
                  status === "ended") && (
                  <Button
                    onClick={handleStopAndComplete}
                    size="lg"
                    variant="destructive"
                    className="gap-2"
                    disabled={status === "connecting"}
                    data-testid="button-end-conversation"
                  >
                    <Square className="h-5 w-5" />
                    ✋ Terminar conversación
                  </Button>
                )}

                {status === "error" && (
                  <Button
                    onClick={startConversation}
                    size="lg"
                    variant="outline"
                    className="gap-2"
                    data-testid="button-retry"
                  >
                    Reintentar
                  </Button>
                )}
              </div>

              <div className="text-sm text-muted-foreground text-center">
                <p>
                  Practica tu conversación en inglés con un asistente de IA.
                </p>
                <p>Asegúrate de permitir el acceso al micrófono.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
      <audio ref={(el) => el} data-testid="audio-remote" hidden />
    </div>
  );
}
