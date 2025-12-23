import { getSystemPrompt } from "../prompts/promptManager";
import { db } from "../db";
import * as schema from "@shared/schema";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function generateAIReply(
  messages: ChatMessage[],
  context: Record<string, any>,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  const { sessionId, userId, userMessage } = context;

  if (!sessionId || !userId) {
    throw new Error("Missing sessionId or userId in generateAIReply()");
  }

  const lessonNumber = context.lessonNumber || 1;
  const systemPrompt = getSystemPrompt(lessonNumber);

  if (userMessage) {
    await db.insert(schema.aiSessionMessages).values({
      sessionId,
      role: "user",
      content: userMessage,
    });
  }

  let history = [...messages];
  const lastMsg = history[history.length - 1];
  if (lastMsg && lastMsg.role === "user" && lastMsg.content === userMessage) {
    history = history.slice(0, -1);
  }

  const finalMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  if (!apiKey) {
    return {
      role: "assistant",
      content: `Mock tutor: ${userMessage}`,
      state: "PRACTICE",
    };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: finalMessages,
      temperature: 0.3,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const aiReply = data?.choices?.[0]?.message?.content || "(No response)";

  await db.insert(schema.aiSessionMessages).values({
    sessionId,
    role: "assistant",
    content: aiReply,
  });

  return {
    role: "assistant",
    content: aiReply,
    state: "PRACTICE",
  };
}

export type { ChatMessage };
