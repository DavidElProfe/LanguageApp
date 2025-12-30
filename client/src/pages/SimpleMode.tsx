import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Eye, EyeOff, Mic } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useSimpleConversation } from "@/hooks/useSimpleConversation";
import ConversationTranscript from "@/components/ConversationTranscript";

export default function SimpleMode() {
  const [, setLocation] = useLocation();
  const [showDebugChat, setShowDebugChat] = useState(false);
  
  const { connectionState, errorMessage, messages, startConversation, stopConversation } =
    useSimpleConversation();

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
          Volver
        </Button>

        <div className="max-w-2xl mx-auto">
          <Card data-testid="card-simple-mode">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Mic className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Modo Simple</CardTitle>
                    <p className="text-sm text-muted-foreground">Conversación guiada con 52 preguntas</p>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDebugChat(!showDebugChat)}
                  className="text-muted-foreground"
                  data-testid="button-toggle-debug"
                >

                  
                  {showDebugChat ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-1" />
                      Ocultar texto
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      Ver texto
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-muted-foreground">
                <p className="mb-4">
                  El tutor te hará 52 preguntas en orden. Solo escucha y responde.
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>Las preguntas son en inglés</li>
                  <li>Las correcciones son en español</li>
                  <li>Al final recibirás un resumen de tu progreso</li>
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

              {showDebugChat && (connectionState === "connecting" || connectionState === "active" || connectionState === "ended") && (
                <ConversationTranscript messages={messages} connectionState={connectionState} />
              )}

              {connectionState === "idle" && (
                <Button
                  onClick={startConversation}
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-start-simple"
                >
                  <Mic className="mr-2 h-5 w-5" />
                  Comenzar conversación
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
                  {!showDebugChat && (
                    <div
                      className="bg-gradient-to-r from-green-500/20 to-green-500/10 border border-green-500/30 rounded-xl p-8 text-center"
                      data-testid="voice-only-indicator"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                            <Mic className="h-10 w-10 text-green-500" />
                          </div>
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full animate-pulse border-2 border-background"></div>
                        </div>
                        <div>
                          <p className="font-semibold text-xl mb-1">Conversación activa</p>
                          <p className="text-sm text-muted-foreground">
                            Escucha y responde en inglés
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {showDebugChat && (
                    <div
                      className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center"
                      data-testid="text-conversation-active"
                    >
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="font-semibold">Modo Simple activo</span>
                      </div>
                      <p className="text-xs text-green-600 font-medium">
                        52 preguntas guiadas
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={stopConversation}
                    variant="destructive"
                    size="lg"
                    className="w-full"
                    data-testid="button-end-conversation"
                  >
                    Terminar conversación
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
                      ¡Buen trabajo! Sigue practicando para mejorar.
                    </p>
                  </div>

                  <Button
                    onClick={startConversation}
                    size="lg"
                    className="w-full bg-green-600 hover:bg-green-700"
                    data-testid="button-restart-simple"
                  >
                    <Mic className="mr-2 h-5 w-5" />
                    Repetir conversación
                  </Button>
                </div>
              )}

              {connectionState === "error" && (
                <Button
                  onClick={startConversation}
                  size="lg"
                  className="w-full"
                  data-testid="button-retry-simple"
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
