import { useRef, useEffect } from "react";
import type { ConversationMessage } from "@/hooks/useRealtimeConversation";
// 1. IMPORTAR el componente
import { TypingIndicator } from "./TypingIndicator";

interface ConversationTranscriptProps {
  messages: ConversationMessage[];
  connectionState: "idle" | "connecting" | "active" | "ended" | "error";
  // 2. NUEVA PROP (Opcional por si otros componentes aún no la pasan)
  isThinking?: boolean;
}

export default function ConversationTranscript({
  messages,
  connectionState,
  isThinking, // Destructurar la prop
}: ConversationTranscriptProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive OR when thinking starts
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking]); // 3. Agregamos isThinking a las dependencias

  if (connectionState === "idle" || connectionState === "error") {
    return null;
  }

  // ⛔ FILTRO CLAVE: solo mensajes finales
  const visibleMessages = messages.filter((message) => {
    // Si no existe isFinal, lo tratamos como válido (mensajes del asistente)
    // Si existe, solo mostramos los finales
    return message.role !== "user" || (message as any).isFinal !== false;
  });

  return (
    <div className="border rounded-lg bg-muted/30 overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b">
        <h3 className="font-semibold text-sm">Conversación en vivo</h3>
      </div>

      <div
        className="h-[400px] overflow-y-auto"
        data-testid="scroll-conversation"
      >
        <div className="p-4 space-y-4">
          {visibleMessages.length === 0 && connectionState === "connecting" && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Conectando...
            </div>
          )}

          {visibleMessages.length === 0 &&
            connectionState === "active" &&
            !isThinking && (
              <div className="text-center text-muted-foreground text-sm py-8">
                Empieza a hablar para ver la transcripción...
              </div>
            )}

          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
              data-testid={`message-${message.role}-${message.id}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted border"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold">
                    {message.role === "user" ? "Tú" : "Asistente"}
                  </span>
                  <span className="text-xs opacity-70">
                    {new Date(message.timestamp).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
              </div>
            </div>
          ))}

          {/* 4. AQUI RENDERIZAMOS LA BURBUJA DENTRO DEL CHAT */}
          {isThinking && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2">
              <TypingIndicator />
            </div>
          )}

          {connectionState === "ended" && visibleMessages.length > 0 && (
            <div className="text-center text-muted-foreground text-xs py-2">
              Conversación terminada
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
