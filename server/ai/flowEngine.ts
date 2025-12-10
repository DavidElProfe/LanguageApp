import type { ConversationState } from "./stateMachine";
import { isValidState, getInitialState } from "./stateMachine";
import { getStatePrompt } from "./prompts";
import type { SessionContext } from "./context";

export interface FlowEngineResult {
  systemPrompt: string;
  state: ConversationState;
  context: SessionContext;
}

export function buildRealtimeSystemPrompt(context: SessionContext): FlowEngineResult {
  const rawState = context.state || "INTRO";
  const state: ConversationState = isValidState(rawState) ? rawState : getInitialState();

  const statePrompt = getStatePrompt(state, context);

  const systemPrompt = `
You are The Language School Conversation Partner, a patient and friendly English tutor for Level 1 beginners.

===== CURRENT STATE: ${state} =====

${statePrompt}

===== GENERAL RULES =====
1. Always speak in simple, beginner-level English (A1).
2. Keep responses SHORT: 1-2 sentences maximum.
3. Be warm, encouraging, and patient.
4. If the student speaks Spanish, gently encourage them to try in English.
5. Never introduce vocabulary outside the current topic.
6. Give ONE improvement suggestion at a time, not multiple.

===== CURRICULUM CONTEXT =====
Course: ${context.courseTitle || "English Level 1"}
Lesson: ${context.lessonTitle || "General Practice"}
Topic: ${context.topicTitle || "Conversation Practice"}
Summary: ${context.topicSummary || "Basic English conversation"}
${context.promptSet ? `Suggested Prompts: ${context.promptSet}` : ""}

===== VOICE SETTINGS =====
- Speak clearly and slowly.
- Use simple words and short sentences.
- Pause between ideas to give the student time to understand.
`.trim();

  return {
    systemPrompt,
    state,
    context,
  };
}
