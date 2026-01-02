import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowLeft, Loader2, Mic, LogOut } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/Navbar";

// IMPORTANTE: Importamos tus dos hooks separados
import { useLesson1Conversation } from "@/hooks/useLesson1Conversation";
import { useLesson2Drill } from "@/hooks/useLesson2Drill";

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
  // ... resto de opciones ...
];

// Definimos la interfaz de datos que devuelven tus hooks
interface HookData {
  connectionState: "idle" | "connecting" | "active" | "ended" | "error";
  errorMessage: string;
  messages: any[];
  startConversation: () => void;
  stopConversation: () => void;
}

// =====================================================================
// 1. COMPONENTE PRINCIPAL (SHELL)
// =====================================================================
export default function ChatPartner() {
  const [, setLocation] = useLocation();
  const [selectedLesson, setSelectedLesson] = useState(1);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/home")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Ver cursos
        </Button>

        {/* AQUÍ ESTÁ EL SWITCH MÁGICO 
            Dependiendo de la lección seleccionada, montamos un componente distinto.
            Esto evita el error de los hooks y separa las lógicas.
        */}
        {selectedLesson === 2 ? (
          <Lesson2Wrapper
            selectedLesson={selectedLesson}
            setSelectedLesson={setSelectedLesson}
          />
        ) : (
          <Lesson1Wrapper
            selectedLesson={selectedLesson}
            setSelectedLesson={setSelectedLesson}
          />
        )}
      </main>
    </div>
  );
}

// =====================================================================
// 2. WRAPPERS (INTERMEDIARIOS)
// =====================================================================

// Wrapper para Lección 1 (Conversación Natural)
function Lesson1Wrapper({ selectedLesson, setSelectedLesson }: any) {
  // Llama al hook SANO
  const hookData = useLesson1Conversation({ part: 1 });

  return (
    <SessionInterface
      hookData={hookData}
      selectedLesson={selectedLesson}
      setSelectedLesson={setSelectedLesson}
      mode="NATURAL"
    />
  );
}

// Wrapper para Lección 2 (Drill Robótico)
function Lesson2Wrapper({ selectedLesson, setSelectedLesson }: any) {
  // Llama al hook HÍBRIDO/DRILL
  const hookData = useLesson2Drill({ part: 1 });

  return (
    <SessionInterface
      hookData={hookData}
      selectedLesson={selectedLesson}
      setSelectedLesson={setSelectedLesson}
      mode="DRILL"
    />
  );
}

// =====================================================================
// 3. UI COMPARTIDA (VISUAL)
// =====================================================================
// Aquí está toda tu lógica visual original para no perder el diseño.
function SessionInterface({
  hookData,
  selectedLesson,
  setSelectedLesson,
  mode,
}: {
  hookData: HookData;
  selectedLesson: number;
  setSelectedLesson: (val: number) => void;
  mode: "NATURAL" | "DRILL";
}) {
  const {
    connectionState,
    errorMessage,
    messages,
    startConversation,
    stopConversation,
  } = hookData;

  const [showDebugChat, setShowDebugChat] = useState(true);
  const [recapRequested, setRecapRequested] = useState(false);

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  mode === "DRILL" ? "bg-purple-100" : "bg-primary/10"
                }`}
              >
                <Mic
                  className={`h-6 w-6 ${mode === "DRILL" ? "text-purple-600" : "text-primary"}`}
                />
              </div>
              <div>
                <CardTitle className="text-2xl">Práctica de Voz</CardTitle>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    mode === "DRILL"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  Modo:{" "}
                  {mode === "DRILL" ? "Repetición Exacta" : "Conversación"}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="text-muted-foreground">
            <p className="mb-4">
              {mode === "DRILL"
                ? "Escucha la frase y repítela exactamente. El sistema avanzará automáticamente."
                : "Habla directamente con el tutor. Escucha y responde naturalmente."}
            </p>
          </div>

          {/* Lesson Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Selecciona la lección:
            </label>
            <Select
              value={selectedLesson.toString()}
              onValueChange={(value) => setSelectedLesson(parseInt(value, 10))}
              disabled={
                connectionState !== "idle" &&
                connectionState !== "ended" &&
                connectionState !== "error"
              }
            >
              <SelectTrigger>
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
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
              {errorMessage}
            </div>
          )}

          {/* Transcript / Debug */}
          {showDebugChat &&
            (connectionState === "connecting" ||
              connectionState === "active" ||
              connectionState === "ended") && (
              <ConversationTranscript
                messages={messages}
                connectionState={connectionState}
              />
            )}

          {/* --- BOTONES DE CONTROL --- */}

          {connectionState === "idle" && (
            <Button
              onClick={startConversation}
              size="lg"
              className={`w-full ${mode === "DRILL" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
            >
              <Mic className="mr-2 h-5 w-5" />
              Empezar a hablar
            </Button>
          )}

          {connectionState === "connecting" && (
            <Button size="lg" className="w-full" disabled>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Conectando...
            </Button>
          )}

          {connectionState === "active" && (
            <div className="space-y-4">
              {!showDebugChat && (
                <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-xl p-8 text-center">
                  <p className="font-semibold text-xl">Escuchando...</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* El botón de Terminar/Recap solo tiene sentido en modo natural por ahora, 
                     pero lo dejamos visualmente. En Drill el stop es directo. */}
                <Button
                  onClick={() => {
                    setRecapRequested(true);
                    // Si el hook tuviera requestSessionRecap lo llamaríamos,
                    // por ahora simulamos el stop.
                    stopConversation();
                  }}
                  variant="outline"
                  size="lg"
                  disabled={recapRequested}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Terminar
                </Button>

                <Button
                  onClick={stopConversation}
                  variant="destructive"
                  size="lg"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {connectionState === "ended" && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-6 text-center">
                <p className="font-semibold mb-2">Conversación terminada</p>
                <p className="text-sm text-muted-foreground">¡Buen trabajo!</p>
              </div>
              <Button onClick={startConversation} size="lg" className="w-full">
                <Mic className="mr-2 h-5 w-5" />
                Nueva conversación
              </Button>
            </div>
          )}

          {connectionState === "error" && (
            <Button onClick={startConversation} size="lg" className="w-full">
              <Mic className="mr-2 h-5 w-5" />
              Intentar nuevamente
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
