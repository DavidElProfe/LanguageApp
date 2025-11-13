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
import { useRealtimeConversation } from "@/hooks/useRealtimeConversation";
import ConversationTranscript from "@/components/ConversationTranscript";
import { queryClient } from "@/lib/queryClient";

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

  const { connectionState, errorMessage, messages, startConversation, stopConversation } =
    useRealtimeConversation();

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
    switch (connectionState) {
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

              {/* Live Conversation Transcript */}
              {(connectionState === "connecting" || connectionState === "active" || connectionState === "ended") && (
                <ConversationTranscript messages={messages} connectionState={connectionState} />
              )}

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {connectionState === "idle" && (
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

                {(connectionState === "connecting" ||
                  connectionState === "active" ||
                  connectionState === "ended") && (
                  <Button
                    onClick={handleStopAndComplete}
                    size="lg"
                    variant="destructive"
                    className="gap-2"
                    disabled={connectionState === "connecting"}
                    data-testid="button-end-conversation"
                  >
                    <Square className="h-5 w-5" />
                    ✋ Terminar conversación
                  </Button>
                )}

                {connectionState === "error" && (
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
