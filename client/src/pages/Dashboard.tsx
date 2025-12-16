import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Flame, Clock, TrendingUp, Target, Play, Award, BookOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardApi } from '@/lib/api';
import StatCard from '@/components/StatCard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function Dashboard() {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Only redirect if loading is complete and user is not authenticated
    if (!loading && !user) {
      setLocation('/auth');
    }
  }, [user, loading, setLocation]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/dashboard/stats'],
    queryFn: () => dashboardApi.getStats(),
    enabled: !!user,
  });

  const { data: nextTopic, isLoading: isLoadingNextTopic } = useQuery({
    queryKey: ['/api/dashboard/next-topic'],
    queryFn: () => dashboardApi.getNextTopic(),
    enabled: !!user,
  });

  const handleContinueLearning = () => {
    // Navigate directly to voice chat
    setLocation('/');
  };

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    const d = new Date(date);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return t('dashboard.today');
    return d.toLocaleDateString('es-ES');
  };

  const getMotivationalMessage = () => {
    const streak = stats?.streak || 0;
    if (streak === 0) {
      return "¡Empieza tu racha hoy!";
    } else if (streak === 1) {
      return "¡Gran inicio! Sigue así";
    } else if (streak < 7) {
      return `¡Increíble! ${streak} días seguidos`;
    } else {
      return `¡Eres un campeón! ${streak} días`;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 py-8 md:py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Welcome Header */}
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-2" data-testid="text-dashboard-title">
              ¡Hola!
            </h1>
            <p className="text-xl text-muted-foreground">
              {isLoading ? 'Cargando...' : getMotivationalMessage()}
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </div>
          ) : (
            <>
              {/* Main CTA Card - Super Obvious */}
              <Card className="mb-8 border-2 border-primary shadow-lg">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <Target className="h-16 w-16 text-primary" />
                  </div>
                  <CardTitle className="text-3xl md:text-4xl mb-2">
                    ¿Listo para aprender?
                  </CardTitle>
                  <CardDescription className="text-lg">
                    {stats?.completedActivities === 0 
                      ? "¡Comienza tu primera lección ahora!"
                      : "¡Continúa donde lo dejaste!"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center pb-8">
                  <Button
                    size="lg"
                    onClick={handleContinueLearning}
                    data-testid="button-continue-level"
                    className="text-lg md:text-xl py-6 px-4 md:px-12 h-auto"
                    disabled={isLoadingNextTopic}
                  >
                    <Play className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6" />
                    {isLoadingNextTopic ? "Cargando..." : (stats?.completedActivities === 0 ? "Empezar Ahora" : "Continuar Aprendiendo")}
                  </Button>
                </CardContent>
              </Card>

              {/* Progress Overview */}
              <div className="mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <TrendingUp className="h-6 w-6 text-primary" />
                      Tu Progreso
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-lg font-medium">Actividades Completadas</span>
                        <span className="text-lg font-bold text-primary">
                          {stats?.completedActivities || 0} de {stats?.totalActivities || 0}
                        </span>
                      </div>
                      <Progress value={stats?.progressPercentage || 0} className="h-3" />
                      <p className="text-sm text-muted-foreground mt-2">
                        {stats?.progressPercentage || 0}% completado
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Streak Card */}
                <Card className="text-center">
                  <CardHeader>
                    <div className="mx-auto mb-2">
                      <Flame className="h-12 w-12 text-orange-500" />
                    </div>
                    <CardTitle className="text-4xl font-bold">
                      {stats?.streak || 0}
                    </CardTitle>
                    <CardDescription className="text-lg">
                      Días de Racha
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {stats?.streak === 0 
                        ? "¡Completa una actividad para comenzar tu racha!"
                        : "¡Sigue así! No pierdas tu racha"}
                    </p>
                  </CardContent>
                </Card>

                {/* Last Activity Card */}
                <Card className="text-center">
                  <CardHeader>
                    <div className="mx-auto mb-2">
                      <Clock className="h-12 w-12 text-blue-500" />
                    </div>
                    <CardTitle className="text-2xl font-bold">
                      {formatDate(stats?.lastActivity)}
                    </CardTitle>
                    <CardDescription className="text-lg">
                      Última Actividad
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {stats?.lastActivity 
                        ? "¡Buen trabajo manteniéndote activo!"
                        : "¡Empieza tu primera lección hoy!"}
                    </p>
                  </CardContent>
                </Card>

                {/* Achievement Card */}
                <Card className="text-center">
                  <CardHeader>
                    <div className="mx-auto mb-2">
                      <Award className="h-12 w-12 text-yellow-500" />
                    </div>
                    <CardTitle className="text-4xl font-bold">
                      {stats?.completedActivities || 0}
                    </CardTitle>
                    <CardDescription className="text-lg">
                      Actividades Completadas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {stats?.completedActivities === 0
                        ? "¡Completa tu primera actividad!"
                        : "¡Cada actividad te acerca más a tu meta!"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Access */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <BookOpen className="h-5 w-5" />
                    Acceso Rápido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setLocation('/courses')}
                      className="h-auto py-4 justify-start"
                      data-testid="button-view-courses"
                    >
                      <BookOpen className="mr-3 h-5 w-5" />
                      <div className="text-left">
                        <div className="font-semibold">Ver Todos los Cursos</div>
                        <div className="text-sm text-muted-foreground">Explora lecciones disponibles</div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setLocation('/settings')}
                      className="h-auto py-4 justify-start"
                      data-testid="button-settings"
                    >
                      <Target className="mr-3 h-5 w-5" />
                      <div className="text-left">
                        <div className="font-semibold">Configuración</div>
                        <div className="text-sm text-muted-foreground">Personaliza tu experiencia</div>
                      </div>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
