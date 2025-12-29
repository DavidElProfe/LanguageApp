import { Router } from "express";
import OpenAI from "openai";
import { SIMPLE_CONVERSATION_PROMPT } from "./prompts/simpleConversationPrompt";
import { SIMPLE_CONVERSATION_PROMPT_2 } from "./prompts/simpleConversationPrompt2";
import {
  getQuestionByIndex,
  findQuestionIndex,
} from "./prompts/simpleConversationQuestions";
import { generateLesson2Context } from "./prompts/lesson2Questions";

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

const isWhatDoesQuestion = (index: number): boolean =>
  index >= WHAT_DOES_START && index <= WHAT_DOES_END;

const looksLikeEnglishAnswer = (text: string): boolean =>
  ENGLISH_ANSWERS.includes(text.trim().toLowerCase());

export const assistantRouter = Router();

interface SimpleSessionState {
  currentQuestionIndex: number;
  lastAdvancedAt: number;
  createdAt: number;
}

interface Lesson2SessionState {
  currentPart: number;
  currentQuestionInPart: number;
  lastAdvancedAt: number;
  createdAt: number;
}

const simpleSessionStates = new Map<string, SimpleSessionState>();
const lesson2SessionStates = new Map<string, Lesson2SessionState>();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * =========================
 * CREATE SIMPLE SESSION
 * =========================
 * Backend:
 *  - creates realtime session (NO instructions)
 *  - returns token + prompt DATA
 */
assistantRouter.get("/simple-session", async (req, res) => {
  try {
    const lessonNumber = Number(req.query.lesson) === 2 ? 2 : 1;

    const sessionId = `simple_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    console.log(`[SESSION_START] ${sessionId} | Lesson ${lessonNumber}`);

    // 🔒 Create realtime session WITHOUT instructions
    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      modalities: ["text", "audio"],
      input_audio_transcription: {
        model: "whisper-1",
      },
      temperature: 0.6,
    });

    if (lessonNumber === 2) {
      const part = Number(req.query.part) || 1;
      const questionInPart = Number(req.query.question) || 1;

      lesson2SessionStates.set(sessionId, {
        currentPart: part,
        currentQuestionInPart: questionInPart,
        lastAdvancedAt: 0,
        createdAt: Date.now(),
      });

      res.json({
        token: response.client_secret.value,
        sessionId,
        lesson: 2,
        promptPayload: {
          basePrompt: SIMPLE_CONVERSATION_PROMPT_2,
          context: generateLesson2Context(part, questionInPart),
          questionText: null,
        },
      });
      return;
    }

    // ---------- LESSON 1 ----------
    const initialIndex = Number(req.query.initialQuestionIndex) || 1;

    simpleSessionStates.set(sessionId, {
      currentQuestionIndex: initialIndex,
      lastAdvancedAt: 0,
      createdAt: Date.now(),
    });

    res.json({
      token: response.client_secret.value,
      sessionId,
      lesson: 1,
      promptPayload: {
        basePrompt: SIMPLE_CONVERSATION_PROMPT,
        context: `You are on Question ${initialIndex}.`,
        questionText: getQuestionByIndex(initialIndex),
      },
    });
  } catch (err: any) {
    console.error("[SESSION_ERROR]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * =========================
 * PROCESS RESPONSE (L1)
 * =========================
 */
assistantRouter.post(
  "/simple-session/:sessionId/process-response",
  async (req, res) => {
    const { sessionId } = req.params;
    const { aiTranscript, studentTranscript } = req.body;

    const state = simpleSessionStates.get(sessionId);
    if (!state) {
      return res.status(404).json({ error: "Session not found" });
    }

    const currentIndex = state.currentQuestionIndex;

    if (
      typeof studentTranscript === "string" &&
      isWhatDoesQuestion(currentIndex) &&
      looksLikeEnglishAnswer(studentTranscript)
    ) {
      return res.json({
        advanced: false,
        guardrailTriggered: true,
        correctionInstruction: "Responde en español, por favor.",
      });
    }

    const detectedIndex = findQuestionIndex(aiTranscript);
    const now = Date.now();

    let advanced = false;

    if (
      detectedIndex === currentIndex + 1 &&
      now - state.lastAdvancedAt > 2000
    ) {
      state.currentQuestionIndex = detectedIndex;
      state.lastAdvancedAt = now;
      advanced = true;
    }

    res.json({
      advanced,
      currentIndex: state.currentQuestionIndex,
      currentQuestion: getQuestionByIndex(state.currentQuestionIndex),
    });
  },
);
