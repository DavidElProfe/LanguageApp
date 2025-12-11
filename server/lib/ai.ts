// server/lib/ai.ts

import { getStatePrompt } from "../ai/prompts";
import { loadSessionContext, updateSessionState } from "../ai/context";
import { getNextState, isValidState, type ConversationState } from "../ai/stateMachine";
import { buildRealtimeSystemPrompt } from "../ai/flowEngine";
import { db } from "../db";
import * as schema from "@shared/schema";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * MAIN AI ENGINE FUNCTION
 * MVP Phase 1 Flow:
 * 1. Load session + curriculum context
 * 2. Build dynamic prompts (state machine + curriculum)
 * 3. Save user message
 * 4. Call OpenAI
 * 5. Save assistant reply
 * 6. Advance state
 * 7. Return response + new state
 */
export async function generateAIReply(
  messages: ChatMessage[],
  context: Record<string, any>,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const { sessionId, userId, userMessage } = context;

  if (!sessionId || !userId) {
    throw new Error("Missing sessionId or userId in generateAIReply()");
  }

  // 1️⃣ LOAD CONTEXT (course, lesson, topic, state)
  const sessionContext = await loadSessionContext(
    userId,
    sessionId,
    context.topicId,
  );

  // 2️⃣ BUILD DYNAMIC PROMPT (state machine + curriculum)
  const { systemPrompt } = buildRealtimeSystemPrompt(sessionContext);

  const rawState = sessionContext.state;
  const state: ConversationState = isValidState(rawState)
    ? rawState
    : "INTRO";

  const statePrompt = getStatePrompt(state, sessionContext);

  // 3️⃣ SAVE USER MESSAGE
  if (userMessage) {
    await db.insert(schema.aiSessionMessages).values({
      sessionId,
      role: "user",
      content: userMessage,
    });
  }

  // 4️⃣ BUILD FINAL MESSAGE LIST
  // Remove only the last message if it duplicates the current userMessage
  let history = [...messages];
  const lastMsg = history[history.length - 1];
  if (lastMsg && lastMsg.role === "user" && lastMsg.content === userMessage) {
    history = history.slice(0, -1);
  }
  
  const finalMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: statePrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  // If API key missing → mock mode
  if (!apiKey) {
    return {
      role: "assistant",
      content: `Mock tutor: ${userMessage}`,
      state,
    };
  }

  // 5️⃣ CALL OPENAI
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: finalMessages,
      temperature: 0.4,
      max_tokens: 120,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const aiReply = data?.choices?.[0]?.message?.content || "(No response)";

  // 6️⃣ SAVE ASSISTANT RESPONSE
  await db.insert(schema.aiSessionMessages).values({
    sessionId,
    role: "assistant",
    content: aiReply,
  });

  // 7️⃣ ADVANCE STATE
  const newState = getNextState(state) || state;
  await updateSessionState(sessionId, newState);

  // 8️⃣ RETURN
  return {
    role: "assistant",
    content: aiReply,
    state: newState,
  };
}

export type { ChatMessage };
