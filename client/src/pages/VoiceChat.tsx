import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, MicOff, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLesson1Conversation } from "@/hooks/useLesson1Conversation";
import { useLesson2Drill } from "@/hooks/useLesson2Drill";

function Lesson1Chat() {
  const {
    connectionState,
    errorMessage,
    messages,
    startConversation,
    stopConversation,
  } = useLesson1Conversation();

  const isConnected = connectionState === "active";
  const isConnecting = connectionState === "connecting";

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle data-testid="text-lesson-title">Lección 1: Conversación Natural</CardTitle>
        <CardDescription>Practica inglés con una conversación libre usando tu voz</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[300px] border rounded-md p-4">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Presiona el botón para empezar a hablar
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground ml-8"
                      : "bg-muted mr-8"
                  }`}
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {errorMessage && (
          <p className="text-destructive text-sm" data-testid="text-error">{errorMessage}</p>
        )}

        <div className="flex justify-center gap-4">
          {!isConnected ? (
            <Button
              size="lg"
              onClick={startConversation}
              disabled={isConnecting}
              data-testid="button-start-voice"
            >
              <Mic className="mr-2 h-5 w-5" />
              {isConnecting ? "Conectando..." : "Empezar a hablar"}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="destructive"
              onClick={stopConversation}
              data-testid="button-stop-voice"
            >
              <MicOff className="mr-2 h-5 w-5" />
              Detener
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Estado: {connectionState}
        </p>
      </CardContent>
    </Card>
  );
}

function Lesson2Chat() {
  const {
    connectionState,
    errorMessage,
    messages,
    startConversation,
    stopConversation,
  } = useLesson2Drill();

  const isConnected = connectionState === "active";
  const isConnecting = connectionState === "connecting";

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle data-testid="text-lesson-title">Lección 2: Drill de Preguntas</CardTitle>
        <CardDescription>Practica con preguntas guiadas usando TTS determinístico</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[300px] border rounded-md p-4">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Presiona el botón para empezar el drill
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground ml-8"
                      : "bg-muted mr-8"
                  }`}
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {errorMessage && (
          <p className="text-destructive text-sm" data-testid="text-error">{errorMessage}</p>
        )}

        <div className="flex justify-center gap-4">
          {!isConnected ? (
            <Button
              size="lg"
              onClick={startConversation}
              disabled={isConnecting}
              data-testid="button-start-drill"
            >
              <Mic className="mr-2 h-5 w-5" />
              {isConnecting ? "Conectando..." : "Empezar drill"}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="destructive"
              onClick={stopConversation}
              data-testid="button-stop-drill"
            >
              <MicOff className="mr-2 h-5 w-5" />
              Detener
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Estado: {connectionState}
        </p>
      </CardContent>
    </Card>
  );
}

export default function VoiceChat() {
  const [selectedLesson, setSelectedLesson] = useState<1 | 2 | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          {selectedLesson === null ? (
            <div className="space-y-8">
              <div className="text-center">
                <h1 className="text-3xl font-bold mb-2">Chat de Voz</h1>
                <p className="text-muted-foreground">Selecciona una lección para practicar</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setSelectedLesson(1)}
                  data-testid="card-lesson-1"
                >
                  <CardHeader>
                    <CardTitle>Lección 1</CardTitle>
                    <CardDescription>Conversación Natural</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Practica inglés con una conversación libre. La IA responde de forma natural usando Realtime API.
                    </p>
                  </CardContent>
                </Card>

                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setSelectedLesson(2)}
                  data-testid="card-lesson-2"
                >
                  <CardHeader>
                    <CardTitle>Lección 2</CardTitle>
                    <CardDescription>Drill de Preguntas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      33 preguntas guiadas con TTS determinístico. La IA habla exactamente el script sin improvisar.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <Button
                variant="ghost"
                onClick={() => setSelectedLesson(null)}
                data-testid="button-back"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>

              {selectedLesson === 1 ? <Lesson1Chat /> : <Lesson2Chat />}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
