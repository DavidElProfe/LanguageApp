import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/Navbar";

// 1. LIMPIEZA DE HOOKS
// Ya no necesitamos importar cada lección por separado
import { useGenericDrill } from "@/hooks/useGenericDrill";

// COMPONENTES
import { VoiceOrb } from "@/components/VoiceOrb";
import ConversationTranscript from "@/components/ConversationTranscript";

// Mantenemos tu lista de opciones (puedes hacerla dinámica luego importando LESSONS_CONFIG)
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
  { value: 3, label: "Lección 3: Comida, compras y números", available: true },
  { value: 4, label: "Lección 4: Actividades diarias", available: false },
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
  const [selectedLesson, setSelectedLesson] = useState(getInitialLesson());

  // 2. EL MOTOR GENÉRICO 🪄
  // En lugar de cargar todos los hooks y elegir cuál usar con un IF,
  // simplemente llamamos al genérico con el ID seleccionado.
  // Cuando cambias el ID en el dropdown, este hook se reinicia solo con la nueva config.
  const {
    connectionState,
    errorMessage,
    messages,
    startConversation,
    stopConversation,
    isThinking,
  } = useGenericDrill(selectedLesson);

  // Mapeo de estados visuales para el Orbe
  const getVisualState = () => {
    if (connectionState === "error") return "error";
    if (connectionState === "idle" || connectionState === "ended")
      return "idle";
    if (isThinking) return "thinking";
    return "listening";
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans transition-colors duration-300">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col items-center">
        {/* BOTÓN VOLVER */}
        <div className="w-full max-w-5xl mb-2">
          <Button
            variant="ghost"
            onClick={() => setLocation("/home")}
            className="text-muted-foreground hover:text-foreground pl-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Cursos
          </Button>
        </div>

        {/* TARJETA PRINCIPAL (max-w-5xl) */}
        <div className="w-full max-w-5xl bg-card rounded-[2rem] shadow-xl border border-border relative overflow-hidden flex flex-col h-[88vh] min-h-[600px] transition-colors duration-300">
          {/* Decoración superior */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 z-10 opacity-80" />

          {/* 1. SECCIÓN SUPERIOR: ORBE (Fija) */}
          <div className="w-full p-6 bg-card z-10 flex flex-col items-center shrink-0 border-b border-border/50">
            <div className="w-full max-w-md mx-auto mb-4">
              {/* SELECTOR DE LECCIÓN */}
              <Select
                value={selectedLesson.toString()}
                onValueChange={(value) => {
                  // Si estaba hablando, cortamos para evitar bugs
                  if (connectionState === "active") stopConversation();
                  setSelectedLesson(parseInt(value, 10));
                }}
                disabled={
                  connectionState !== "idle" &&
                  connectionState !== "ended" &&
                  connectionState !== "error"
                }
              >
                <SelectTrigger className="w-full border-0 bg-muted/40 hover:bg-muted/60 rounded-xl text-center font-medium shadow-sm h-9 text-sm focus:ring-0 text-foreground">
                  <SelectValue placeholder="Selecciona una lección" />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value.toString()}
                      disabled={!option.available}
                    >
                      {option.label}
                      {!option.available && " — Próximamente"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <VoiceOrb
              state={getVisualState()}
              onStart={startConversation}
              onStop={stopConversation}
            />

            {errorMessage && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg text-center w-full max-w-md animate-in fade-in">
                {errorMessage}
              </div>
            )}
          </div>

          {/* 2. SECCIÓN INFERIOR: TRANSCRIPT (Ancho completo) */}
          <div className="w-full flex-1 overflow-y-auto bg-muted/10 scroll-smooth">
            <div className="w-full h-full max-w-4xl mx-auto p-6 md:p-8">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Mic className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-base text-muted-foreground italic">
                    Presiona "Start Conversation" para comenzar.
                  </p>
                </div>
              ) : (
                <>
                  <ConversationTranscript
                    messages={messages}
                    connectionState={connectionState}
                    isThinking={isThinking}
                  />
                  <div className="h-12" />
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
