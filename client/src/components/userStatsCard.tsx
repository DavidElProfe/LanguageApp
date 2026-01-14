import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Flame, Snowflake, User } from "lucide-react"; // Iconos bonitos

interface UserData {
  displayName: string;
  email: string;
  stats: {
    role: string;
    totalXp: number;
    currentStreak: number;
    preferences: {
      theme: string;
    };
  };
}

export function UserStatsCard({ userId }: { userId: string }) {
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulamos un pequeño delay para que aprecies el Skeleton (opcional)
    setLoading(true);
    fetch(`/api/me?userId=${userId}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching stats:", err);
        setLoading(false);
      });
  }, [userId]);

  // 1. ESTADO DE CARGA (Skeleton) 💀
  // Esto evita que la pantalla "salte" cuando cargan los datos
  if (loading) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[60px]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-[120px] mb-2" />
          <Skeleton className="h-4 w-[200px]" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // Lógica para el emoji de racha
  const hasStreak = data.stats.currentStreak > 0;

  return (
    <Card className="w-full max-w-md border-2 border-primary/10 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">
            {data.displayName}
          </CardTitle>
        </div>
        {/* Badge dinámico según el rol */}
        <Badge variant={data.stats.role === "admin" ? "destructive" : "secondary"}>
          {data.stats.role.toUpperCase()}
        </Badge>
      </CardHeader>
      
      <CardContent>
        <div className="flex justify-between items-end">
          {/* Sección de XP */}
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Experiencia Total
            </span>
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" />
              <span className="text-3xl font-bold tracking-tight">
                {data.stats.totalXp} XP
              </span>
            </div>
          </div>

          {/* Sección de Racha */}
          <div className="flex flex-col items-end">
             <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Racha Actual
            </span>
            <div className={`flex items-center gap-1 ${hasStreak ? "text-orange-500" : "text-blue-400"}`}>
              {hasStreak ? <Flame className="h-6 w-6 animate-pulse" /> : <Snowflake className="h-6 w-6" />}
              <span className="text-2xl font-bold">
                {data.stats.currentStreak}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}