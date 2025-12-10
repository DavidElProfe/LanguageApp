export type SessionState =
  | "INTRO"
  | "ASK_NAME"
  | "ASK_LESSON"
  | "PRACTICE"
  | "FEEDBACK"
  | "END";

export function determineNextState(
  state: SessionState,
  userMessage: string,
): SessionState {
  switch (state) {
    case "INTRO":
      return "ASK_NAME";

    case "ASK_NAME":
      if (userMessage.trim().length > 0) return "ASK_LESSON";
      return "ASK_NAME";

    case "ASK_LESSON":
      return "PRACTICE";

    case "PRACTICE":
      if (userMessage.toLowerCase().includes("bye")) return "FEEDBACK";
      return "PRACTICE";

    case "FEEDBACK":
      return "END";

    default:
      return "END";
  }
}
