import { useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { aiApi } from "../lib/api";
import { cn } from "../lib/utils";

type Message = { role: "user" | "assistant"; content: string };

interface ConversationPartnerProps {
  courseId?: string;
  topicId?: string;
  courseTitle?: string;
  lessonTitle?: string;
  topicTitle?: string;
  activityType?: string;
  promptSet?: string[];
  collapsedByDefault?: boolean;
  onComplete?: () => void;
}

export default function ConversationPartner({
  courseId,
  topicId,
  courseTitle,
  lessonTitle,
  topicTitle,
  activityType,
  promptSet = [],
  collapsedByDefault = false,
  onComplete,
}: ConversationPartnerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isOpen, setIsOpen] = useState(!collapsedByDefault);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [sessionId] = useState(
    () => "sess_" + Math.random().toString(36).substring(7),
  );

  const context = useMemo(
    () => ({ courseTitle, lessonTitle, topicTitle, activityType, promptSet }),
    [courseTitle, lessonTitle, topicTitle, activityType, promptSet],
  );

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;

    const nextMessages = [...messages, { role: "user", content } as Message];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const res = await aiApi.chatPipeline(content, sessionId, messages, {
        courseId: courseId || "dev-course-1",
        topicId: topicId || "dev-topic-1",
      });

      const reply = res.message;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply?.content || "" },
      ]);

      if (res.state && res.state.passed && onComplete) {
        onComplete();
      }
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Lo siento, hubo un problema con el chat. Intenta de nuevo.",
        },
      ]);
    } finally {
      setIsSending(false);
      setTimeout(
        () => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }),
        0,
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Compañero de conversación IA</CardTitle>
            <CardDescription>
              Practica conversación en contexto del tema actual
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={() => setIsOpen((v) => !v)}>
            {isOpen ? "Minimizar" : "Abrir"}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent>
          {promptSet.length > 0 && messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {promptSet.slice(0, 6).map((p, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  onClick={() => send(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          )}
          <ScrollArea
            className="h-64 border rounded-md p-3"
            ref={scrollRef as any}
          >
            <div className="space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Escribe un mensaje o elige una frase sugerida para comenzar.
                </p>
              )}
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-muted",
                  )}
                >
                  {m.content}
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="mt-3 flex items-start gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              rows={2}
            />
            <Button
              onClick={() => send()}
              disabled={isSending || input.trim() === ""}
            >
              {isSending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
