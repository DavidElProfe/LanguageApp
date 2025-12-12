import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen } from "lucide-react";

export default function Courses() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();

  const {
    data: courses = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["/api/courses"],
    queryFn: async () => {
      const res = await fetch("/api/courses");
      if (!res.ok) throw new Error("Failed to load courses");
      return res.json();
    },
  });

  const { data: completions = [] } = useQuery({
    queryKey: ["/api/completions"],
    queryFn: async () => {
      if (globalThis.__supabaseInitPromise) {
        await globalThis.__supabaseInitPromise;
      }
      const client = (globalThis as any).__supabaseClient;
      const { data } = await client?.auth.getSession();
      const token = data?.session?.access_token || "";
      const res = await fetch("/api/completions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!user,
  });

  const visibleCourses = courses.filter(
    (course: any) => course.title !== "Fundamentos de Inglés 1",
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h1
            className="text-3xl md:text-4xl font-bold mb-8"
            data-testid="text-courses-title"
          >
            {t("practice.title")}
          </h1>

          {isLoading ? (
            <div className="text-center py-12" data-testid="text-loading">
              {t("common.loading")}
            </div>
          ) : error ? (
            <div className="text-center py-12" data-testid="text-error">
              <p className="text-destructive mb-4">{t("common.error")}</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : "Error al cargar los cursos"}
              </p>
            </div>
          ) : visibleCourses.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-courses">
              <p className="text-muted-foreground">
                No hay cursos disponibles en este momento.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleCourses.map((course: any) => {
                const allActivities = (course.lessons || []).flatMap((l: any) =>
                  (l.topics || []).flatMap((t: any) => t.activities || []),
                );
                const totalActivities = allActivities.length;
                const safeCompletions = Array.isArray(completions)
                  ? completions
                  : [];
                const completedSet = new Set(
                  safeCompletions.map((c: any) => c.activityId),
                );
                const completedCount = allActivities.filter((a: any) =>
                  completedSet.has(a.id),
                ).length;
                const progressPercent =
                  totalActivities > 0
                    ? Math.round((completedCount / totalActivities) * 100)
                    : 0;
                const completedLabel = t("common.completed");
                const completedText =
                  completedLabel === "common.completed"
                    ? "completadas"
                    : completedLabel;

                return (
                  <Card
                    key={course.id}
                    className="hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setLocation(`/courses/${course.id}`)}
                    data-testid={`card-course-${course.id}`}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <BookOpen className="h-6 w-6 text-primary" />
                        <div>
                          <CardTitle>{course.title}</CardTitle>
                          <CardDescription className="mt-2">
                            {course.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    {user && (
                      <CardContent>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">
                            {completedCount} / {totalActivities} {completedText}
                          </span>
                          <span className="text-sm font-medium">
                            {progressPercent}%
                          </span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
