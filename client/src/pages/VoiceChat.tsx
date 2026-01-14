import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Mic, LogOut } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/Navbar";

// ✅ IMPORTAMOS EL AUTH CONTEXT
import { useAuth } from "@/contexts/AuthContext";

// ✅ IMPORTAMOS EL NUEVO HOOK UNIFICADO
import { useGenericDrill } from "@/hooks/useGenericDrill";

import ConversationTranscript from "@/components/ConversationTranscript";

const LESSON_OPTIONS = [
  {
    value: 1,
    label: "Lección 1: Presentaciones y conversación básica",
    available: true,
  },
  {
    value: 2,
    label: "Lección 2: Describir cosas y preferencias",
    available: true,
  },
  { 
    value: 3, 
    label: "Lección 3: Comida, compras y preferencias", 
    available: true 
  },
  { 
    value: 4, 
    label: "Lección 4: Actividades diarias y Rutina", 
    available: true // ✅ ¡AHORA ESTÁ DISPONIBLE!
  },
  { value: 5, label: "Lección 5: Presente simple", available: false },
  { value: 6, label: "Lección 6: Restaurantes", available: false },
  { value: 7, label: "Lección 7: Hoteles y viajes", available: false },
  { value: 8, label: "Lección 8: Estilo de vida", available: false },
  { value: 9, label: "Lección 9: Rutinas", available: false },
  { value: 10, label: "Lección 10: Repaso", available: false },
];

const getInitialLesson = () => {
  if (typeof window === "undefined") return 1;
  const params = new URLSearchParams(window.location.search);
  const lesson = params.get("lesson");
  const lessonNum = lesson ? parseInt(lesson, 10) : 1;
  return isNaN(lessonNum) ? 1 : lessonNum;
};

export default function VoiceChat() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [selectedLesson, setSelectedLesson] = useState(getInitialLesson());
  const [showDebugChat] = useState(true);
  
  const [isFinishing, setIsFinishing] = useState(false);

  // 🚀 LA MAGIA: Una sola línea para manejarlas a todas
  // El hook automáticamente carga la configuración correcta (preguntas, sistema, modo estricto)
  // basándose en el ID que eliges en el selector.
  const {
    connectionState,
    errorMessage,
    messages,
    startConversation,
    stopConversation,
    isThinking,
  } = useGenericDrill(selectedLesson);

  // 💰 FUNCIÓN MAESTRA: Terminar y Cobrar XP
  const handleFinishLesson = async () => {
    if (!user) return;
    
    setIsFinishing(true);
    
    // 1. Cortar la llamada
    stopConversation();

    try {
      // 2. Dar XP (50 XP por sesión)
      await fetch("/api/progress/xp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, amount: 50 }),
      });

      // 3. Volver al Dashboard
      setTimeout(() => {
        setLocation("/dashboard"); 
      }, 500);

    } catch (error) {
      console.error("Error guardando progreso:", error);
      setIsFinishing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/dashboard")}
          className="mb-6"
          data-testid="button-back-home"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al Panel
        </Button>

        <div className="max-w-2xl mx-auto">
          <Card data-testid="card-chat-partner">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mic className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Práctica de Voz</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-muted-foreground">
                <p className="mb-4">
                  Habla directamente con el tutor. Solo escucha y responde.
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>El tutor te hará preguntas sencillas</li>
                  <li>Responde en inglés con oraciones cortas</li>
                  <li>Si no entiendes, di "No entendí"</li>
                </ul>
              </div>

              <div className="space-y-2">
                <label htmlFor="lesson-select" className="text-sm font-medium">
                  Selecciona la lección que quieres practicar:
                </label>
                <Select
                  value={selectedLesson.toString()}
                  onValueChange={(value) =>
                    setSelectedLesson(parseInt(value, 10))
                  }
                  disabled={
                    connectionState !== "idle" &&
                    connectionState !== "ended" &&
                    connectionState !== "error"
                  }
                >
                  <SelectTrigger id="lesson-select" data-testid="select-lesson">
                    <SelectValue placeholder="Selecciona una lección" />
                  </SelectTrigger>
                  <SelectContent>
                    {LESSON_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value.toString()}
                        disabled={!option.available}
                        className={!option.available ? "opacity-50" : ""}
                      >
                        {option.label}
                        {!option.available && " — Próximamente"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {errorMessage && (
                <div
                  className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive"
                  data-testid="text-error-message"
                >
                  {errorMessage}
                </div>
              )}

              {showDebugChat &&
                (connectionState === "connecting" ||
                  connectionState === "active" ||
                  connectionState === "ended") && (
                  <div className="flex flex-col gap-4">
                    <ConversationTranscript
                      messages={messages}
                      connectionState={connectionState}
                      isThinking={isThinking}
                    />
                  </div>
                )}

              {connectionState === "idle" && (
                <Button
                  onClick={startConversation}
                  size="lg"
                  className="w-full"
                  data-testid="button-start-conversation"
                >
                  <Mic className="mr-2 h-5 w-5" />
                  Empezar a hablar
                </Button>
              )}

              {connectionState === "connecting" && (
                <Button
                  size="lg"
                  className="w-full"
                  disabled
                  data-testid="button-connecting"
                >
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Conectando...
                </Button>
              )}

              {connectionState === "active" && (
                <div className="space-y-4">
                  {!showDebugChat && (
                    <div
                      className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-xl p-8 text-center"
                      data-testid="voice-only-indicator"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center">
                            <Mic className="h-10 w-10 text-primary" />
                          </div>
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full animate-pulse border-2 border-background"></div>
                        </div>
                        <div>
                          <p className="font-semibold text-xl mb-1">
                            Estás hablando con el tutor
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Escucha y responde en inglés
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {showDebugChat && (
                    <div
                      className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center"
                      data-testid="text-conversation-active"
                    >
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <div
                          className={`w-3 h-3 rounded-full animate-pulse ${isThinking ? "bg-yellow-500" : "bg-green-500"}`}
                        ></div>
                        <span className="font-semibold">
                          {isThinking
                            ? "Analizando respuesta..."
                            : "Conversación activa"}
                        </span>
                      </div>
                      <p
                        className="text-xs text-primary font-medium"
                        data-testid="text-active-lesson"
                      >
                        {LESSON_OPTIONS.find((o) => o.value === selectedLesson)
                          ?.label || `Lección ${selectedLesson}`}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {/* 👇 BOTÓN DE TERMINAR CON XP */}
                    <Button
                      onClick={handleFinishLesson}
                      disabled={isFinishing}
                      variant="outline"
                      size="lg"
                      data-testid="button-finish-recap"
                    >
                      {isFinishing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="mr-2 h-4 w-4" />
                      )}
                      {isFinishing ? "Guardando..." : "Terminar"}
                    </Button>
                    
                    <Button
                      onClick={stopConversation}
                      variant="destructive"
                      size="lg"
                      data-testid="button-end-conversation"
                      disabled={isFinishing}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {connectionState === "ended" && (
                <div className="space-y-4">
                  <div
                    className="bg-muted rounded-lg p-6 text-center"
                    data-testid="text-conversation-ended"
                  >
                    <p className="font-semibold mb-2">Conversación terminada</p>
                    <p className="text-sm text-muted-foreground">
                      ¡Buen trabajo! Sigue practicando para mejorar.
                    </p>
                  </div>

                  <Button
                    onClick={startConversation}
                    size="lg"
                    className="w-full"
                    data-testid="button-restart-conversation"
                  >
                    <Mic className="mr-2 h-5 w-5" />
                    Empezar nueva conversación
                  </Button>
                </div>
              )}

              {connectionState === "error" && (
                <Button
                  onClick={startConversation}
                  size="lg"
                  className="w-full"
                  data-testid="button-retry-conversation"
                >
                  <Mic className="mr-2 h-5 w-5" />
                  Intentar nuevamente
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}