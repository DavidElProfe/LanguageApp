import { loadSessionContext, updateSessionState, saveMessage } from "../ai/context";
import { buildRealtimeSystemPrompt } from "../ai/flowEngine";
import { getNextState, isValidState } from "../ai/stateMachine";
import type { ConversationState } from "../ai/stateMachine";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface GenerateAIReplyParams {
  userMessage: string;
  userId: string;
  sessionId: string;
  topicId?: string;
  conversationHistory?: ChatMessage[];
}

export interface GenerateAIReplyResult {
  response: ChatMessage;
  newState: ConversationState | null;
  currentState: ConversationState;
}

export async function generateAIReply(
  params: GenerateAIReplyParams
): Promise<GenerateAIReplyResult> {
  const { userMessage, userId, sessionId, topicId, conversationHistory = [] } = params;

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_PUBLIC;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // 1. Cargar sesión
  const context = await loadSessionContext(userId, sessionId, topicId);

  // 2. Construir systemPrompt con buildRealtimeSystemPrompt()
  const { systemPrompt, state: currentState } = buildRealtimeSystemPrompt(context);

  // 3. Guardar mensaje del usuario
  await saveMessage(sessionId, "user", userMessage);

  // 4. Preparar mensajes para OpenAI
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  let responseContent: string;

  // MOCK MODE (SIN API KEY)
  if (!apiKey) {
    responseContent = `Mock tutor: ${userMessage.slice(0, 200)}\n\nSuggestion: Try a variation or ask a follow-up question.`;
  } else {
    // 5. Enviar a OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
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
    responseContent = data?.choices?.[0]?.message?.content || "(No response)";
  }

  // 6. Guardar respuesta del assistant
  await saveMessage(sessionId, "assistant", responseContent);

  // 7. Avanzar estado con getNextState() + updateSessionState()
  const nextState = getNextState(currentState);
  if (nextState) {
    await updateSessionState(sessionId, nextState);
  }

  // 8. Devolver respuesta + nuevo estado
  return {
    response: { role: "assistant", content: responseContent },
    newState: nextState,
    currentState,
  };
}

export type { ChatMessage };
