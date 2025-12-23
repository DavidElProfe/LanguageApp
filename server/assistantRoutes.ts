import { Router } from "express";
import OpenAI from "openai";
import { SIMPLE_CONVERSATION_PROMPT } from "./prompts/lesson1Prompt";
import {
  TOTAL_QUESTIONS,
  getQuestionByIndex,
  findQuestionIndex,
} from "./prompts/simpleConversationQuestions";

const WHAT_DOES_START = 24;
const WHAT_DOES_END = 31;

const ENGLISH_ANSWERS = [
  "computer",
  "office",
  "paper",
  "employee",
  "director",
  "student",
  "conference room",
  "classroom",
];

const isWhatDoesQuestion = (index: number): boolean => {
  return index >= WHAT_DOES_START && index <= WHAT_DOES_END;
};

const looksLikeEnglishAnswer = (text: string): boolean => {
  return ENGLISH_ANSWERS.includes(text.trim().toLowerCase());
};

export const assistantRouter = Router();

interface SimpleSessionState {
  currentQuestionIndex: number;
  lastAdvancedAt: number;
  createdAt: number;
}

const simpleSessionStates = new Map<string, SimpleSessionState>();

function getOrCreateSessionState(
  sessionId: string,
  initialIndex: number = 0,
): SimpleSessionState {
  if (!simpleSessionStates.has(sessionId)) {
    const state: SimpleSessionState = {
      currentQuestionIndex: Math.max(
        0,
        Math.min(initialIndex, TOTAL_QUESTIONS),
      ),
      lastAdvancedAt: 0,
      createdAt: Date.now(),
    };
    simpleSessionStates.set(sessionId, state);
    console.log(
      `[Lesson1] Created session ${sessionId} at question ${state.currentQuestionIndex}`,
    );
  }
  return simpleSessionStates.get(sessionId)!;
}

function generateSilentContext(questionIndex: number): string {
  const baseContext = `
[INTERNAL ORIENTATION - DO NOT MENTION THIS TO THE STUDENT]

=== SESSION RESET NOTICE ===
This is a FRESH session. You have NO memory of previous questions or answers.
Do NOT summarize, reference, or acknowledge any prior conversation.
Do NOT say things like "Let's continue" or "Where were we".
Simply ask the current question as if starting fresh.

=== CURRENT POSITION ===
`;

  if (questionIndex <= 1) {
    return (
      baseContext +
      `You are about to start the conversation. Begin with question 1: "${getQuestionByIndex(1)}"
Do not reference question numbers aloud. Simply ask the question naturally.
[END INTERNAL ORIENTATION]
`
    );
  }
  return (
    baseContext +
    `You are currently at question ${questionIndex} of ${TOTAL_QUESTIONS}.
The current question is: "${getQuestionByIndex(questionIndex)}"
Do not reference question numbers aloud. Simply ask the question naturally.
Start by asking ONLY this question. Do not recap or summarize anything.
[END INTERNAL ORIENTATION]
`
  );
}

setInterval(
  () => {
    const now = Date.now();
    const MAX_SESSION_AGE = 2 * 60 * 60 * 1000;
    const entries = Array.from(simpleSessionStates.entries());
    for (const [sessionId, state] of entries) {
      if (now - state.createdAt > MAX_SESSION_AGE) {
        simpleSessionStates.delete(sessionId);
        console.log(`[Lesson1] Cleaned up expired session ${sessionId}`);
      }
    }
  },
  15 * 60 * 1000,
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

assistantRouter.get("/lesson1-session", async (req, res) => {
  try {
    console.log("=== LESSON 1 SESSION REQUEST ===");

    const initialQuestionIndexParam = req.query.initialQuestionIndex;
    let initialQuestionIndex = 1;

    if (initialQuestionIndexParam) {
      const parsed = parseInt(initialQuestionIndexParam as string, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= TOTAL_QUESTIONS) {
        initialQuestionIndex = parsed;
        console.log(
          `[Lesson1] Starting at custom question index: ${initialQuestionIndex}`,
        );
      }
    }

    const sessionId = `lesson1_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const sessionState = getOrCreateSessionState(
      sessionId,
      initialQuestionIndex,
    );

    const silentContext = generateSilentContext(
      sessionState.currentQuestionIndex,
    );
    const fullInstructions = SIMPLE_CONVERSATION_PROMPT + silentContext;

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: fullInstructions,
      modalities: ["text", "audio"],
      turn_detection: {
        type: "server_vad",
        threshold: 0.6,
        prefix_padding_ms: 500,
        silence_duration_ms: 2000,
      },
      input_audio_transcription: {
        model: "whisper-1",
      },
    });

    console.log(
      "OPENAI_RESPONSE_OK - Session created, token length:",
      response.client_secret?.value?.length,
    );
    console.log(
      `[Lesson1] Session ${sessionId} ready at question ${sessionState.currentQuestionIndex}`,
    );

    res.json({
      token: response.client_secret.value,
      lesson: 1,
      sessionId: sessionId,
      currentQuestionIndex: sessionState.currentQuestionIndex,
      totalQuestions: TOTAL_QUESTIONS,
    });
  } catch (error: any) {
    console.error("=== OPENAI API ERROR ===");
    console.error("Status:", error.status);
    console.error("Code:", error.code);
    console.error("Type:", error.type);
    console.error("Message:", error.message);

    if (error.status === 429 || error.code === "insufficient_quota") {
      console.error("OPENAI_QUOTA_EXCEEDED");
    } else if (error.status === 401) {
      console.error("OPENAI_AUTH_ERROR");
    } else {
      console.error("OPENAI_OTHER_ERROR");
    }

    res.status(500).json({
      error: "Failed to create lesson 1 session",
      message: error.message,
      openai_error_code: error.code,
      openai_error_type: error.type,
    });
  }
});

assistantRouter.get("/simple-session", async (req, res) => {
  try {
    console.log("=== SIMPLE SESSION REQUEST (legacy, redirecting to lesson1) ===");

    const initialQuestionIndexParam = req.query.initialQuestionIndex;
    let initialQuestionIndex = 1;

    if (initialQuestionIndexParam) {
      const parsed = parseInt(initialQuestionIndexParam as string, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= TOTAL_QUESTIONS) {
        initialQuestionIndex = parsed;
      }
    }

    const sessionId = `lesson1_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const sessionState = getOrCreateSessionState(
      sessionId,
      initialQuestionIndex,
    );

    const silentContext = generateSilentContext(
      sessionState.currentQuestionIndex,
    );
    const fullInstructions = SIMPLE_CONVERSATION_PROMPT + silentContext;

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: fullInstructions,
      modalities: ["text", "audio"],
      turn_detection: {
        type: "server_vad",
        threshold: 0.6,
        prefix_padding_ms: 500,
        silence_duration_ms: 2000,
      },
      input_audio_transcription: {
        model: "whisper-1",
      },
    });

    res.json({
      token: response.client_secret.value,
      mode: "simple",
      instructionsIncluded: true,
      sessionId: sessionId,
      currentQuestionIndex: sessionState.currentQuestionIndex,
      totalQuestions: TOTAL_QUESTIONS,
    });
  } catch (error: any) {
    console.error("Error in simple-session:", error.message);
    res.status(500).json({
      error: "Failed to create session",
      message: error.message,
    });
  }
});

assistantRouter.post(
  "/simple-session/:sessionId/process-response",
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { aiTranscript, studentTranscript } = req.body;

      if (!aiTranscript || typeof aiTranscript !== "string") {
        return res.status(400).json({ error: "aiTranscript is required" });
      }

      const sessionState = simpleSessionStates.get(sessionId);
      if (!sessionState) {
        console.log(
          `[Lesson1] Session ${sessionId} not found, creating new state`,
        );
        return res.status(404).json({ error: "Session not found" });
      }

      const currentIndex = sessionState.currentQuestionIndex;

      if (
        typeof studentTranscript === "string" &&
        isWhatDoesQuestion(currentIndex) &&
        looksLikeEnglishAnswer(studentTranscript)
      ) {
        console.log(
          `[WhatDoesGuard] BLOCKED English answer on Q${currentIndex + 1}: "${studentTranscript}"`,
        );

        return res.json({
          sessionId,
          previousIndex: currentIndex,
          currentIndex,
          advanced: false,
          guardrailTriggered: true,
          reason: "english_answer_on_spanish_required_question",
          correctionInstruction:
            "Aquí tienes que responder en español. Por ejemplo: 'employee' significa 'empleado'. Intenta otra vez en español.",
          currentQuestion: getQuestionByIndex(currentIndex),
        });
      }

      const detectedIndex = findQuestionIndex(aiTranscript);

      console.log(
        `[Lesson1] Processing response for session ${sessionId}`,
      );
      console.log(
        `[Lesson1] Current index: ${currentIndex}, Detected in AI response: ${detectedIndex}`,
      );

      let advanced = false;
      let newIndex = currentIndex;

      const now = Date.now();
      const timeSinceLastAdvance = now - sessionState.lastAdvancedAt;
      const MIN_ADVANCE_INTERVAL = 2000;

      if (
        detectedIndex !== null &&
        timeSinceLastAdvance >= MIN_ADVANCE_INTERVAL
      ) {
        if (detectedIndex === currentIndex + 1) {
          sessionState.currentQuestionIndex = detectedIndex;
          sessionState.lastAdvancedAt = now;
          newIndex = detectedIndex;
          advanced = true;
          console.log(`[Lesson1] Advanced to question ${newIndex}`);
        } else if (detectedIndex === currentIndex) {
          console.log(
            `[Lesson1] AI repeated question ${currentIndex}, not advancing`,
          );
        } else if (detectedIndex > currentIndex + 1) {
          console.log(
            `[Lesson1] WARNING: AI tried to skip to question ${detectedIndex}, staying at ${currentIndex}`,
          );
        }
      }

      res.json({
        sessionId,
        previousIndex: currentIndex,
        currentIndex: newIndex,
        advanced,
        detectedQuestionIndex: detectedIndex,
        currentQuestion: getQuestionByIndex(newIndex),
        totalQuestions: TOTAL_QUESTIONS,
      });
    } catch (error: any) {
      console.error("[Lesson1] Error processing response:", error);
      res
        .status(500)
        .json({ error: "Failed to process response", message: error.message });
    }
  },
);

assistantRouter.get("/simple-session/:sessionId/state", (req, res) => {
  const { sessionId } = req.params;
  const sessionState = simpleSessionStates.get(sessionId);

  if (!sessionState) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json({
    sessionId,
    currentQuestionIndex: sessionState.currentQuestionIndex,
    currentQuestion: getQuestionByIndex(sessionState.currentQuestionIndex),
    totalQuestions: TOTAL_QUESTIONS,
    createdAt: sessionState.createdAt,
  });
});
