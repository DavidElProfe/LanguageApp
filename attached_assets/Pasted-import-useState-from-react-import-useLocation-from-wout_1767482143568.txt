import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  ArrowLeft,
  Loader2,
  Eye,
  EyeOff,
  Mic,
  LogOut,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import { useRealtimeConversation } from "@/hooks/useRealtimeConversation";
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

export default function ChatPartner() {
  const [, setLocation] = useLocation();
  const [selectedLesson, setSelectedLesson] = useState(1);
  const [showDebugChat, setShowDebugChat] = useState(true);
  const [recapRequested, setRecapRequested] = useState(false);

  const {
    connectionState,
    errorMessage,
    messages,
    currentLesson,
    currentStep,
    startConversation,
    stopConversation,
    requestSessionRecap,
  } = useRealtimeConversation({ lesson: selectedLesson, part: 1 });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/home")}
          className="mb-6"
          data-testid="button-back-home"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Ver cursos
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
                  <li>Si no entiendes, el tutor repetirá</li>
                </ul>
              </div>

              {/* Lesson Selector */}
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

              {/* Debug mode: Show text transcription only when enabled */}
              {showDebugChat &&
                (connectionState === "connecting" ||
                  connectionState === "active" ||
                  connectionState === "ended") && (
                  <ConversationTranscript
                    messages={messages}
                    connectionState={connectionState}
                  />
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
                  {/* Voice-only indicator - shown when debug mode is off */}
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

                  {/* Active conversation indicator - shown when debug mode is on */}
                  {showDebugChat && (
                    <div
                      className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center"
                      data-testid="text-conversation-active"
                    >
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="font-semibold">
                          Conversación activa
                        </span>
                      </div>
                      <p
                        className="text-xs text-primary font-medium"
                        data-testid="text-active-lesson"
                      >
                        {LESSON_OPTIONS.find((o) => o.value === currentLesson)
                          ?.label || `Lección ${currentLesson}`}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => {
                        setRecapRequested(true);
                        requestSessionRecap();
                      }}
                      variant="outline"
                      size="lg"
                      disabled={recapRequested}
                      data-testid="button-finish-recap"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Terminar
                    </Button>
                    <Button
                      onClick={stopConversation}
                      variant="destructive"
                      size="lg"
                      data-testid="button-end-conversation"
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
