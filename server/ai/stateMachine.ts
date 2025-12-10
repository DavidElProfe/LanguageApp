export type ConversationState = 
  | "INTRO"
  | "ASK_NAME"
  | "ASK_LESSON"
  | "PRACTICE"
  | "FEEDBACK"
  | "END";

export const STATE_FLOW: Record<ConversationState, ConversationState | null> = {
  INTRO: "ASK_NAME",
  ASK_NAME: "ASK_LESSON",
  ASK_LESSON: "PRACTICE",
  PRACTICE: "FEEDBACK",
  FEEDBACK: "END",
  END: null,
};

export function getNextState(current: ConversationState): ConversationState | null {
  return STATE_FLOW[current];
}

export function isValidState(state: string): state is ConversationState {
  return ["INTRO", "ASK_NAME", "ASK_LESSON", "PRACTICE", "FEEDBACK", "END"].includes(state);
}

export function getInitialState(): ConversationState {
  return "INTRO";
}
