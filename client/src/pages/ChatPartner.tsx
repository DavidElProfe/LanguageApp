import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowLeft, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useRealtimeConversation } from "@/hooks/useRealtimeConversation";
import ConversationTranscript from "@/components/ConversationTranscript";

export default function ChatPartner() {
  const [, setLocation] = useLocation();
  const { connectionState, errorMessage, messages, startConversation, stopConversation } =
    useRealtimeConversation();

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
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Compañero de Conversación IA</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-muted-foreground">
                <p className="mb-4">
                  Practica tus habilidades conversacionales con nuestro asistente de IA.
                  Puedes hablar sobre cualquier tema en el idioma que estás aprendiendo.
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>Habla naturalmente con el asistente</li>
                  <li>Recibe retroalimentación en tiempo real</li>
                  <li>Practica pronunciación y fluidez</li>
                  <li>Conversación privada y segura</li>
                </ul>
              </div>

              {errorMessage && (
                <div
                  className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive"
                  data-testid="text-error-message"
                >
                  {errorMessage}
                </div>
              )}

              {/* Live Conversation Transcript */}
              {(connectionState === "connecting" || connectionState === "active" || connectionState === "ended") && (
                <ConversationTranscript messages={messages} connectionState={connectionState} />
              )}

              {connectionState === "idle" && (
                <Button
                  onClick={startConversation}
                  size="lg"
                  className="w-full"
                  data-testid="button-start-conversation"
                >
                  <MessageSquare className="mr-2 h-5 w-5" />
                  🎤 Empezar conversación
                </Button>
              )}

              {connectionState === "connecting" && (
                <Button size="lg" className="w-full" disabled data-testid="button-connecting">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Conectando...
                </Button>
              )}

              {connectionState === "active" && (
                <div className="space-y-4">
                  <div
                    className="bg-primary/10 border border-primary/20 rounded-lg p-6 text-center"
                    data-testid="text-conversation-active"
                  >
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="font-semibold text-lg">Conversación activa</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Habla con claridad cerca del micrófono
                    </p>
                  </div>

                  <Button
                    onClick={stopConversation}
                    variant="destructive"
                    size="lg"
                    className="w-full"
                    data-testid="button-end-conversation"
                  >
                    ✋ Terminar conversación
                  </Button>
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
                      ¡Buen trabajo! Sigue practicando para mejorar tus habilidades.
                    </p>
                  </div>

                  <Button
                    onClick={startConversation}
                    size="lg"
                    className="w-full"
                    data-testid="button-restart-conversation"
                  >
                    <MessageSquare className="mr-2 h-5 w-5" />
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
                  <MessageSquare className="mr-2 h-5 w-5" />
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
