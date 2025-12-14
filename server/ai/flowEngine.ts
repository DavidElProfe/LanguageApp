import type { ConversationState } from "./stateMachine";
import { isValidState, getInitialState } from "./stateMachine";
import type { SessionContext } from "./context";
import { getSystemPrompt } from "../prompts/promptManager";

export interface FlowEngineResult {
  systemPrompt: string;
  state: ConversationState;
  context: SessionContext;
}

export function buildRealtimeSystemPrompt(context: SessionContext): FlowEngineResult {
  const rawState = context.state || "INTRO";
  const state: ConversationState = isValidState(rawState) ? rawState : getInitialState();

  const lessonNumber = context.lessonNumber || 1;
  const systemPrompt = getSystemPrompt(lessonNumber);

  return {
    systemPrompt,
    state,
    context,
  };
}
