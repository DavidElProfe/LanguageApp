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

// IMPORTAMOS LOS HOOKS
import { useLesson1Drill } from "@/hooks/useLesson1Drill";
import { useLesson2Drill } from "@/hooks/useLesson2Drill";

// COMPONENTES DE UI NUEVOS
import { VoiceOrb } from "@/components/VoiceOrb";
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
  { value: 3, label: "Lección 3: Comida, compras y números", available: false },
  {
    value: 4,
    label: "Lección 4: Actividades diarias (yo/tú)",
    available: false,
  },
  { value: 5, label: "Lección 5: Presente simple (él/ella)", available: false },
  { value: 6, label: "Lección 6: Restaurantes", available: false },
  { value: 7, label: "Lección 7: Hoteles y viajes", available: false },
  {
    value: 8,
    label: "Lección 8: Preferencias y estilo de vida",
    available: false,
  },
  { value: 9, label: "Lección 9: Rutinas y orden temporal", available: false },
  { value: 10, label: "Lección 10: Verbos comunes y repaso", available: false },
];

// 🛠️ DEV TOOL: Lee la URL para saber qué lección cargar
const getInitialLesson = () => {
  if (typeof window === "undefined") return 1;
  const params = new URLSearchParams(window.location.search);
  const lesson = params.get("lesson");
  const lessonNum = lesson ? parseInt(lesson, 10) : 1;
  return isNaN(lessonNum) ? 1 : lessonNum;
};

export default function VoiceChat() {
  const [, setLocation] = useLocation();

  // 🛠️ ESTADO
  const [selectedLesson, setSelectedLesson] = useState(getInitialLesson());

  // Inicializamos los hooks
  const lesson1 = useLesson1Drill();
  const lesson2 = useLesson2Drill();

  // Elegimos cuál usar según el estado
  const activeHook = selectedLesson === 2 ? lesson2 : lesson1;

  const {
    connectionState,
    errorMessage,
    messages,
    startConversation,
    stopConversation,
    isThinking,
  } = activeHook as any;

  // 🎨 LÓGICA DE UI: Traducimos estado técnico a visual
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

      <main className="flex-1 container mx-auto px-4 py-6 flex flex-col items-center">
        {/* BOTÓN VOLVER (Discreto y adaptativo) */}
        <div className="w-full max-w-2xl mb-4">
          <Button
            variant="ghost"
            onClick={() => setLocation("/home")}
            className="text-muted-foreground hover:text-foreground pl-0"
            data-testid="button-back-home"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Cursos
          </Button>
        </div>

        {/* CONTENEDOR PRINCIPAL (Estilo iOS/Chat moderno) */}
        <div className="w-full max-w-md bg-card rounded-[2.5rem] shadow-xl border border-border relative overflow-hidden flex flex-col items-center h-[80vh] min-h-[600px] transition-colors duration-300">
          {/* Decoración superior (Gradiente sutil) */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 z-10 opacity-80" />

          {/* 1. SECCIÓN SUPERIOR: CONTROLES Y ORBE (Fija) */}
          <div className="w-full p-6 pb-4 bg-card z-10 flex flex-col items-center shrink-0 border-b border-border/50">
            {/* Selector de Lección */}
            <div className="w-full mb-6">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block text-center">
                Active Lesson
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
                <SelectTrigger
                  className="w-full border-0 bg-muted/40 hover:bg-muted/60 rounded-xl text-center font-medium shadow-sm h-9 text-sm focus:ring-0 text-foreground transition-colors"
                  data-testid="select-lesson"
                >
                  <SelectValue placeholder="Selecciona una lección" />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value.toString()}
                      disabled={!option.available}
                      className="cursor-pointer"
                    >
                      {option.label}
                      {!option.available && " — Próximamente"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ✨ EL NUEVO ORBE ✨ */}
            <div className="my-2">
              <VoiceOrb
                state={getVisualState()}
                onStart={startConversation}
                onStop={stopConversation}
              />
            </div>

            {/* Mensaje de Error (Si existe) */}
            {errorMessage && (
              <div
                className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg text-center w-full animate-in fade-in slide-in-from-top-2"
                data-testid="text-error-message"
              >
                {errorMessage}
              </div>
            )}
          </div>

          {/* 2. SECCIÓN INFERIOR: TRANSCRIPT (Scrollable) */}
          <div className="w-full flex-1 overflow-y-auto bg-muted/10 p-4 scroll-smooth">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-50 space-y-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                  <Mic className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground italic max-w-[200px]">
                  Presiona "Start Conversation" para comenzar la práctica.
                </p>
              </div>
            ) : (
              <div className="pb-4">
                <ConversationTranscript
                  messages={messages}
                  connectionState={connectionState}
                  isThinking={isThinking}
                />
                {/* Espaciador final para que el último mensaje no quede pegado */}
                <div className="h-8" />
              </div>
            )}
          </div>
        </div>

        {/* Footer simple fuera del card */}
        <div className="mt-6 text-center opacity-40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
            Powered by OpenAI Realtime & Whisper
          </p>
        </div>
      </main>
    </div>
  );
}
