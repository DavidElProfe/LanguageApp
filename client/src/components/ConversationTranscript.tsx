import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationMessage } from "@/hooks/useRealtimeConversation";

interface ConversationTranscriptProps {
  messages: ConversationMessage[];
  connectionState: "idle" | "connecting" | "active" | "ended" | "error";
}

export default function ConversationTranscript({ messages, connectionState }: ConversationTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (connectionState === "idle" || connectionState === "error") {
    return null;
  }

  return (
    <div className="border rounded-lg bg-muted/30 overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b">
        <h3 className="font-semibold text-sm">Conversación en vivo</h3>
      </div>
      <ScrollArea className="h-[400px]" data-testid="scroll-conversation">
        <div ref={scrollRef} className="p-4 space-y-4">
          {messages.length === 0 && connectionState === "connecting" && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Conectando...
            </div>
          )}
          {messages.length === 0 && connectionState === "active" && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Empieza a hablar para ver la transcripción...
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
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
          {connectionState === "ended" && messages.length > 0 && (
            <div className="text-center text-muted-foreground text-xs py-2">
              Conversación terminada
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
