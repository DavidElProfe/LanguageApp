import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EmbedFrame from "@/components/EmbedFrame";
import { queryClient } from "@/lib/queryClient";

export default function TopicDetail() {
  const [, params] = useRoute(
    "/courses/:courseId/lessons/:lessonId/topics/:topicId",
  );
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
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
      const token = await getAuthToken();
      const res = await fetch("/api/completions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.json();
    },
    enabled: !!user,
  });

  const completeActivity = useMutation({
    mutationFn: async (activityId: string) => {
      const res = await fetch(`/api/activities/${activityId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/completions"] });
    },
  });

  const getAuthToken = async () => {
    if (globalThis.__supabaseInitPromise) {
      await globalThis.__supabaseInitPromise;
    }
    const client = globalThis.__supabaseClient;
    if (!client || !client.auth) return "";
    const {
      data: { session },
    } = await client.auth.getSession();
    return session?.access_token || "";
  };

  if (isLoading || !course) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center py-12">{t("common.loading")}</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const lesson = course.lessons.find((l: any) => l.id === params?.lessonId);
  const topic = lesson?.topics.find((t: any) => t.id === params?.topicId);

  if (!lesson || !topic) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center py-12">Tema no encontrado</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Find previous topic for back navigation
  const currentTopicIndex = lesson.topics.findIndex((t: any) => t.id === params?.topicId);
  const previousTopic = currentTopicIndex > 0 ? lesson.topics[currentTopicIndex - 1] : null;

  const sortedActivities = topic.activities;
  const firstVideo = sortedActivities.find((a: any) => a.type === "video");
  const hasQuizlet = sortedActivities.some((a: any) => a.type === "quizlet");
  const hasChat = sortedActivities.some((a: any) => a.type === "chat");
  const quizletActivities = sortedActivities.filter((a: any) => a.type === "quizlet");

  const completedActivityIds = new Set(
    (Array.isArray(completions) ? completions : []).map((c: any) => c.activityId)
  );

  const isVideoCompleted = firstVideo && completedActivityIds.has(firstVideo.id);
  const areQuizletsCompleted = quizletActivities.every((a: any) => completedActivityIds.has(a.id));
  
  // Chat is unlocked when video (and flashcards if present) are completed
  const isChatUnlocked = isVideoCompleted && (!hasQuizlet || areQuizletsCompleted);

  const handleActivityComplete = async (activityId: string, navigateAfter?: () => void) => {
    if (!user) {
      toast({
        title: "Por favor inicia sesión",
        description: "Inicia sesión para seguir tu progreso",
      });
      setLocation("/auth");
      return;
    }
    
    try {
      await completeActivity.mutateAsync(activityId);
      toast({
        title: "¡Progreso guardado!",
        description: "Actividad marcada como completada",
      });
      if (navigateAfter) {
        navigateAfter();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo guardar el progreso. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 py-6 sm:py-12">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="mb-8 flex flex-wrap items-center gap-2">
            {previousTopic ? (
              <Button
                variant="ghost"
                onClick={() =>
                  setLocation(
                    `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${previousTopic.id}/flashcards`,
                  )
                }
                data-testid="button-back-to-previous-activity"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Anterior: {previousTopic.title}
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() =>
                  setLocation(
                    `/courses/${params?.courseId}/lessons/${params?.lessonId}`,
                  )
                }
                data-testid="button-back-to-lesson"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                {t("topic.backToLesson")}
              </Button>
            )}
          </div>

          <div className="mb-8">
            <h1
              className="text-3xl md:text-4xl font-bold mb-2"
              data-testid="text-topic-title"
            >
              {topic.title}
            </h1>
            <p className="text-muted-foreground">{topic.summary}</p>
          </div>

          {firstVideo && (() => {
            const src = typeof (firstVideo as any).videoUrl === 'string' ? (firstVideo as any).videoUrl : "";
            if (!src) return null;
            let videoId = "";
            let timestamp = "";
            if (src.includes('/embed/')) {
              const embedMatch = src.match(/\/embed\/([^?&]+)/);
              videoId = embedMatch?.[1] || "";
            } else if (src.includes('watch?v=')) {
              const watchMatch = src.match(/watch\?v=([^&]+)/);
              videoId = watchMatch?.[1] || "";
            } else if (src.includes('youtu.be/')) {
              const shortMatch = src.match(/youtu\.be\/([^?&]+)/);
              videoId = shortMatch?.[1] || "";
            }
            const timestampMatch = src.match(/[?&]t=(\d+)/);
            timestamp = timestampMatch?.[1] || "";
            const embedUrl = `https://www.youtube.com/embed/${videoId}${timestamp ? `?start=${timestamp}` : ""}`;
            const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
            
            return (
              <div key={firstVideo.id}>
                <EmbedFrame
                  type="youtube"
                  embedUrl={embedUrl}
                  externalUrl={watchUrl}
                  title="Ver lección en video"
                  onInteraction={() => {}}
                  isCompleted={isVideoCompleted}
                  onComplete={() => {
                    // Determine where to navigate: Quizlet → Chat → Next Topic
                    let navigateTo: string | null = null;
                    
                    if (hasQuizlet) {
                      // Has flashcards - go to flashcards
                      navigateTo = `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}/flashcards`;
                    } else if (hasChat) {
                      // Has chat - go to chat
                      navigateTo = `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}/chat`;
                    } else {
                      // No flashcards or chat - find next topic or go back to lesson
                      const currentTopicIndex = lesson.topics.findIndex((t: any) => t.id === params?.topicId);
                      const nextTopic = currentTopicIndex < lesson.topics.length - 1 ? lesson.topics[currentTopicIndex + 1] : null;
                      
                      if (nextTopic) {
                        navigateTo = `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${nextTopic.id}`;
                      } else {
                        navigateTo = `/courses/${params?.courseId}/lessons/${params?.lessonId}`;
                      }
                    }
                    
                    // If already completed, just navigate
                    if (isVideoCompleted && navigateTo) {
                      setLocation(navigateTo);
                    } else if (!isVideoCompleted && navigateTo) {
                      // Not completed - await mutation then navigate
                      handleActivityComplete(firstVideo.id, () => setLocation(navigateTo!));
                    }
                  }}
                  nextButtonText="Continuar"
                />
              </div>
            );
          })()}

          {hasChat && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-3 rounded-full">
                      <MessageSquare className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Actividad 3: Conversar con IA</h3>
                      <p className="text-sm text-muted-foreground">
                        {!isChatUnlocked 
                          ? "Completa las actividades anteriores para desbloquear" 
                          : "Practica tu conversación en inglés"}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() =>
                      setLocation(
                        `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}/chat`
                      )
                    }
                    disabled={!isChatUnlocked}
                    data-testid="button-start-chat"
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {isChatUnlocked ? "Empezar conversación" : "Bloqueado"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
