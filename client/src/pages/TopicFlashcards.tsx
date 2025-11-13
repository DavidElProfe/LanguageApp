import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import EmbedFrame from "@/components/EmbedFrame";
import { queryClient } from "@/lib/queryClient";

export default function TopicFlashcards() {
  const [, params] = useRoute(
    "/courses/:courseId/lessons/:lessonId/topics/:topicId/flashcards",
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
      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }
      const client = globalThis.__supabaseClient;
      const token = client ? (await client.auth.getSession()).data.session?.access_token : "";
      const res = await fetch("/api/completions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!user,
  });

  const completeActivity = useMutation({
    mutationFn: async (activityId: string) => {
      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }
      const client = globalThis.__supabaseClient;
      const token = client ? (await client.auth.getSession()).data.session?.access_token : "";
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

  const activityList = topic.activities as any[];
  const completedIds = new Set((Array.isArray(completions) ? completions : []).map((c: any) => c.activityId));
  const quizletActivities = activityList.filter((a) => a.type === "quizlet");
  const hasChat = activityList.some((a) => a.type === "chat");

  // Find next topic for navigation after completing flashcards
  const currentTopicIndex = lesson.topics.findIndex((t: any) => t.id === params?.topicId);
  const nextTopic = currentTopicIndex < lesson.topics.length - 1 ? lesson.topics[currentTopicIndex + 1] : null;

  const handleFlashcardComplete = async (activityId: string) => {
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

      // Navigate to chat if available, otherwise next topic
      if (hasChat) {
        setLocation(
          `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}/chat`,
        );
      } else if (nextTopic) {
        setLocation(
          `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${nextTopic.id}`,
        );
      } else {
        // No more topics, go back to lesson
        setLocation(
          `/courses/${params?.courseId}/lessons/${params?.lessonId}`,
        );
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo guardar el progreso. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  const handleNavigateNext = () => {
    if (hasChat) {
      setLocation(
        `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}/chat`,
      );
    } else if (nextTopic) {
      setLocation(
        `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${nextTopic.id}`,
      );
    } else {
      setLocation(
        `/courses/${params?.courseId}/lessons/${params?.lessonId}`,
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-6 sm:py-12">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() =>
                setLocation(
                  `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}`,
                )
              }
              data-testid="button-back-to-topic"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Volver al video
            </Button>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{topic.title}</h1>
            <p className="text-muted-foreground">Tarjetas de vocabulario</p>
          </div>

          <div className="space-y-6">
            {quizletActivities.length === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sin tarjetas</CardTitle>
                  <CardDescription>Este tema no tiene tarjetas disponibles.</CardDescription>
                </CardHeader>
              </Card>
            )}
            {quizletActivities.map((activity: any) => {
              const isCompleted = completedIds.has(activity.id);
              return (
                <EmbedFrame
                  key={activity.id}
                  type="quizlet"
                  embedUrl={activity.embedUrl}
                  externalUrl={activity.embedUrl.replace('/embed', '').split('?')[0]}
                  title="Practicar con Quizlet"
                  onInteraction={() => {}}
                  isCompleted={isCompleted}
                  onComplete={() => {
                    // If already completed, just navigate without mutation
                    if (isCompleted) {
                      handleNavigateNext();
                    } else {
                      // Not completed - await mutation then navigate
                      handleFlashcardComplete(activity.id);
                    }
                  }}
                  nextButtonText={nextTopic ? `Siguiente: ${nextTopic.title}` : "Volver a la lección"}
                />
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
