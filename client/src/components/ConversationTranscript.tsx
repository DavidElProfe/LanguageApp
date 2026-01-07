import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User } from "lucide-react";
// Mantenemos tu importación de tipos si la necesitas, o usamos la interfaz local abajo
import type { ConversationMessage } from "@/hooks/useRealtimeConversation";

interface ConversationTranscriptProps {
  messages: ConversationMessage[];
  connectionState: "idle" | "connecting" | "active" | "ended" | "error";
  isThinking?: boolean;
}

export default function ConversationTranscript({
  messages,
  connectionState,
  isThinking,
}: ConversationTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. TU LÓGICA DE FILTRADO (Muy importante mantenerla)
  // Solo mostramos mensajes finales del usuario para evitar duplicados visuales
  const visibleMessages = messages.filter((message) => {
    return message.role !== "user" || (message as any).isFinal !== false;
  });

  // 2. AUTO-SCROLL
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleMessages.length, isThinking]);

  // Si no hay nada que mostrar y no está pensando, no renderizamos nada (o un placeholder)
  if (
    visibleMessages.length === 0 &&
    !isThinking &&
    connectionState !== "connecting"
  ) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-4 w-full px-2">
      <AnimatePresence initial={false}>
        {visibleMessages.map((msg, index) => {
          const isUser = msg.role === "user";
          // Usamos el ID del mensaje o el índice como fallback
          const key = msg.id || index;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-[85%] md:max-w-[75%] gap-2 ${
                  isUser ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* ICONO (Avatar) */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isUser ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>

                {/* BURBUJA DE CHAT */}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-none" // Usuario (Azul/Negro)
                      : "bg-card border border-border text-card-foreground rounded-tl-none" // IA (Blanco/Gris)
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Timestamp discreto (opcional) */}
                  {/* <span className="text-[10px] opacity-50 block mt-1 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span> 
                  */}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* 3. BURBUJA DE "PENSANDO..." (Animada) */}
      {isThinking && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex justify-start w-full"
        >
          <div className="flex gap-2 max-w-[75%]">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="bg-muted/50 border border-border px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1.5 h-10">
              <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce"></span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Elemento invisible para anclar el scroll */}
      <div ref={scrollRef} className="h-1" />
    </div>
  );
}
