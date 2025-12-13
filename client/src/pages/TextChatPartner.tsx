import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, ArrowLeft, Send, Loader2, Keyboard } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import Navbar from "@/components/Navbar";

const LESSON_OPTIONS = [
  { value: 1, label: "Lección 1: Presentaciones y conversación básica" },
  { value: 2, label: "Lección 2: Describir cosas y preferencias" },
  { value: 3, label: "Lección 3: Comida, compras y números" },
  { value: 4, label: "Lección 4: Actividades diarias (yo/tú)" },
  { value: 5, label: "Lección 5: Presente simple (él/ella)" },
  { value: 6, label: "Lección 6: Restaurantes" },
  { value: 7, label: "Lección 7: Hoteles y viajes" },
  { value: 8, label: "Lección 8: Preferencias y estilo de vida" },
  { value: 9, label: "Lección 9: Rutinas y orden temporal" },
  { value: 10, label: "Lección 10: Verbos comunes y repaso" },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function TextChatPartner() {
  const [, setLocation] = useLocation();
  const [selectedLesson, setSelectedLesson] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setError(null);
    
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant/text-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          lesson: selectedLesson,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error("Error al enviar mensaje");
      }

      const data = await response.json();
      setMessages([...newMessages, { role: "assistant", content: data.response }]);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

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
          <Card data-testid="card-text-chat">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Keyboard className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Chat de Texto IA</CardTitle>
                  <p className="text-sm text-muted-foreground">Modo texto para pruebas</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Select
                  value={selectedLesson.toString()}
                  onValueChange={(value) => {
                    setSelectedLesson(parseInt(value, 10));
                    clearChat();
                  }}
                  disabled={isLoading}
                >
                  <SelectTrigger className="flex-1" data-testid="select-lesson">
                    <SelectValue placeholder="Selecciona una lección" />
                  </SelectTrigger>
                  <SelectContent>
                    {LESSON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {messages.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearChat} data-testid="button-clear-chat">
                    Limpiar
                  </Button>
                )}
              </div>

              {error && (
                <div
                  className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm"
                  data-testid="text-error-message"
                >
                  {error}
                </div>
              )}

              <ScrollArea className="h-[400px] border rounded-lg p-4" ref={scrollAreaRef}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                    <p className="text-center">
                      Escribe un mensaje para empezar a practicar.<br />
                      <span className="text-sm">El tutor usará el vocabulario de la lección seleccionada.</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                          data-testid={`message-${msg.role}-${index}`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg p-3">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe tu mensaje en inglés..."
                  disabled={isLoading}
                  data-testid="input-message"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  data-testid="button-send"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
