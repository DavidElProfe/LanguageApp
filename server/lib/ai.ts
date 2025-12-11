import type { Request } from "express";
import { getStatePrompt } from "../ai/prompts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function generateAIReply(
  messages: ChatMessage[],
  context: Record<string, any>,
) {
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_PUBLIC;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // SYSTEM PROMPT BASE
  const systemPrompt = `
  You are The Language School Conversation Partner, a patient and friendly English tutor for Level 1 beginners.

  Your job is to guide the student through a structured learning flow aligned with the curriculum.
  Always use simple English unless the student asks for help in Spanish.

  ===== CONTEXT =====
  ${JSON.stringify(
    {
      courseTitle: context.courseTitle,
      lessonTitle: context.lessonTitle,
      topicTitle: context.topicTitle,
      topicSummary: context.topicSummary,
      promptSet: context.promptSet,
      activityType: context.activityType,
    },
    null,
    2,
  )}

  ===== RULES =====
  1. START OF SESSION
     - Greet the student warmly.
     - If it's early in the conversation and the student's name is unknown, ask for it.
     - If the lesson/topic is unclear, ask which lesson they are studying.

  2. PRACTICE (BASED ON CURRICULUM)
     - Use ONLY vocabulary and grammar from the lesson and topic.
     - Ask very simple questions related to the topic.
     - Give the student time to answer before continuing.
     - If the student makes mistakes, correct them gently and briefly.
     - Provide exactly ONE improvement suggestion per reply.

  3. TONE & STYLE
     - Very friendly, encouraging, supportive.
     - Short replies: 1–2 sentences only.
     - Beginner English (A1 level).
     - Positive reinforcement every few turns.

  4. DO NOT
     - Do NOT introduce vocabulary outside of the topic.
     - Do NOT give long explanations unless the student explicitly asks for help.
     - Do NOT skip steps in the flow.

  5. END OF SESSION
     - Provide a recap of strengths, common mistakes, and 1–2 improvement tips.
     - Encourage the student to continue learning.

  Follow the curriculum strictly and keep the interaction simple, safe, and supportive.
  `;

  // 🎯  AGREGAMOS EL STATE PROMPT AQUÍ
  const statePrompt = getStatePrompt(context.state, context);

  // 🔥 ESTA ES LA VERSIÓN FINAL DE LOS MENSAJES ENVIADOS A OPENAI
  const finalMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: statePrompt }, // <-- CLAVE DEL FLUJO
    ...messages,
  ];

  // MOCK MODE (SIN API KEY)
  if (!apiKey) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const echo = lastUser?.content?.slice(0, 200) || "Let's begin.";
    return {
      role: "assistant",
      content: `Mock tutor: ${echo}\n\nSuggestion: Try a variation or ask a follow-up question.`,
    } as ChatMessage;
  }

  // REAL OPENAI REQUEST
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: finalMessages,
      temperature: 0.6,
      presence_penalty: 0.2,
      frequency_penalty: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "(No response)";

  return { role: "assistant", content } as ChatMessage;
}

export type { ChatMessage };
