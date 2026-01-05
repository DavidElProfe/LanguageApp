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
  CardContent,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
// Importamos el componente que tiene la lógica del Pipeline
import ConversationPartner from "@/components/ConversationPartner";

export default function AIChatActivity() {
  const [, params] = useRoute(
    "/courses/:courseId/lessons/:lessonId/topics/:topicId/chat",
  );
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // 1. Obtener datos del curso
  const { data: course, isLoading } = useQuery({
    queryKey: ["/api/courses", params?.courseId],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${params?.courseId}`);
      return res.json();
    },
  });

  // 2. Obtener completados para saber si ya lo hizo
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

  // 3. Mutación para marcar como completado
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

  const lesson = course?.lessons?.find((l: any) => l.id === params?.lessonId);
  const topic = lesson?.topics?.find((t: any) => t.id === params?.topicId);
  const chatActivity = topic?.activities?.find((a: any) => a.type === "chat");

  const completedIds = new Set(
    (Array.isArray(completions) ? completions : []).map(
      (c: any) => c.activityId,
    ),
  );
  const isActivityComplete = chatActivity?.id
    ? completedIds.has(chatActivity.id)
    : false;

  // Lógica que se ejecuta cuando el Pipeline dice "Aprobado"
  const handlePipelineCompletion = async () => {
    if (!user) return;

    if (!isActivityComplete && chatActivity?.id) {
      try {
        await completeActivity.mutateAsync(chatActivity.id);
        toast({
          title: "¡Excelente!",
          description: "Lección de conversación completada.",
        });
      } catch {
        toast({
          title: "Error",
          description: "No se pudo guardar el progreso",
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading || !course) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 py-12 text-center">Cargando...</main>
        <Footer />
      </div>
    );
  }

  if (!lesson || !topic) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 py-12 text-center">
          Actividad no encontrada
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Button
            variant="ghost"
            onClick={() =>
              setLocation(
                `/courses/${params?.courseId}/lessons/${params?.lessonId}/topics/${params?.topicId}`,
              )
            }
            className="mb-6"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Volver al tema
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>Práctica de Conversación</CardTitle>
              <CardDescription>
                Tema: {topic.title} - {lesson.title}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* AQUÍ ESTÁ LA MAGIA: Usamos el componente conectado al Pipeline */}
              <ConversationPartner
                courseId={params?.courseId}
                topicId={params?.topicId}
                courseTitle={course.title}
                lessonTitle={lesson.title}
                topicTitle={topic.title}
                activityType="roleplay"
                promptSet={["Hello!", "Can we practice?", "I am ready"]} // Puedes personalizar esto según el topic
                collapsedByDefault={false}
                onComplete={handlePipelineCompletion}
              />
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
