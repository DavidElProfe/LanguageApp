import { Router } from "express";
import OpenAI from "openai";
import {
  getBasePrompt,
  getLessonPrompt,
  validateLesson,
  TOTAL_LESSONS,
  getLesson1MasterPrompt,
  getLesson1Step,
  type Lesson1Step,
} from "./prompts/promptManager";
import { SIMPLE_CONVERSATION_PROMPT } from "./prompts/simpleConversationPrompt";
import { SIMPLE_CONVERSATION_PROMPT_2 } from "./prompts/simpleConversationPrompt2";
import {
  TOTAL_QUESTIONS,
  getQuestionByIndex,
  findQuestionIndex,
} from "./prompts/simpleConversationQuestions";
import {
  getLesson2Part,
  getLesson2Question,
  getLesson2PartQuestionCount,
  generateLesson2Context,
} from "./prompts/lesson2Questions";

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

interface Lesson2SessionState {
  currentPart: number;
  currentQuestionInPart: number;
  lastAdvancedAt: number;
  lastUserInputAt: number;
  createdAt: number;
}

const simpleSessionStates = new Map<string, SimpleSessionState>();
const lesson2SessionStates = new Map<string, Lesson2SessionState>();

function generateSilentContext(questionIndex: number): string {
  const currentQuestion = getQuestionByIndex(questionIndex);

  return `
[INTERNAL SYSTEM OVERRIDE]
- CURRENT_QUESTION: "${currentQuestion}"
- GOAL: Ask this question and wait for the student.
- DO NOT mention other questions.
- DO NOT say "Good", "Nice", or "Next".
- DO NOT advance. The system handles transitions.
- If the student is correct, STAY SILENT or await instructions.
[END OVERRIDE]
`;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

assistantRouter.get("/simple-session", async (req, res) => {
  try {
    const lessonParam = req.query.lesson;
    let lessonNumber = 1;
    if (lessonParam) {
      const parsed = parseInt(lessonParam as string, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 2) {
        lessonNumber = parsed;
      }
    }

    const sessionId = `simple_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    let fullInstructions: string;

    if (lessonNumber === 2) {
      const partNumber = parseInt(req.query.part as string, 10) || 1;
      const questionInPart = parseInt(req.query.question as string, 10) || 1;

      const lesson2State = getOrCreateLesson2SessionState(
        sessionId,
        partNumber,
        questionInPart,
      );
      const lesson2Context = generateLesson2Context(
        lesson2State.currentPart,
        lesson2State.currentQuestionInPart,
      );
      fullInstructions = SIMPLE_CONVERSATION_PROMPT_2 + lesson2Context;

      const response = await createRealtimeSession(fullInstructions);
      res.json({
        token: response.client_secret.value,
        mode: "simple",
        lesson: lessonNumber,
        sessionId,
        part: lesson2State.currentPart,
        currentQuestionInPart: lesson2State.currentQuestionInPart,
      });
    } else {
      const initialIndex =
        parseInt(req.query.initialQuestionIndex as string, 10) || 1;
      const sessionState = getOrCreateSessionState(sessionId, initialIndex);
      const silentContext = generateSilentContext(
        sessionState.currentQuestionIndex,
      );

      fullInstructions = SIMPLE_CONVERSATION_PROMPT + silentContext;

      const response = await createRealtimeSession(fullInstructions);
      res.json({
        token: response.client_secret.value,
        mode: "simple",
        lesson: lessonNumber,
        sessionId,
        currentQuestionIndex: sessionState.currentQuestionIndex,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function createRealtimeSession(instructions: string) {
  return await openai.beta.realtime.sessions.create({
    model: "gpt-4o-realtime-preview-2024-12-17",
    voice: "alloy",
    instructions: instructions,
    modalities: ["text", "audio"],
    turn_detection: {
      type: "server_vad",
      threshold: 0.6,
      prefix_padding_ms: 500,
      silence_duration_ms: 2500, // Aumentado para evitar interrupciones
    },
    input_audio_transcription: {
      model: "whisper-1",
    },
  });
}

assistantRouter.post(
  "/simple-session/:sessionId/process-response",
  async (req, res) => {
    const { sessionId } = req.params;
    const { aiTranscript, studentTranscript } = req.body;
    const sessionState = simpleSessionStates.get(sessionId);

    if (!sessionState)
      return res.status(404).json({ error: "Session not found" });

    const currentIndex = sessionState.currentQuestionIndex;

    // Guardrail para traducciones
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
      now - sessionState.lastAdvancedAt > 2000
    ) {
      sessionState.currentQuestionIndex = detectedIndex;
      sessionState.lastAdvancedAt = now;
      advanced = true;
    }

    res.json({
      advanced,
      currentIndex: sessionState.currentQuestionIndex,
      currentQuestion: getQuestionByIndex(sessionState.currentQuestionIndex),
    });
  },
);

// Helper para estados
function getOrCreateSessionState(id: string, idx: number): SimpleSessionState {
  if (!simpleSessionStates.has(id)) {
    simpleSessionStates.set(id, {
      currentQuestionIndex: idx,
      lastAdvancedAt: 0,
      createdAt: Date.now(),
    });
  }
  return simpleSessionStates.get(id)!;
}

function getOrCreateLesson2SessionState(
  id: string,
  part: number,
  q: number,
): Lesson2SessionState {
  if (!lesson2SessionStates.has(id)) {
    lesson2SessionStates.set(id, {
      currentPart: part,
      currentQuestionInPart: q,
      lastAdvancedAt: 0,
      lastUserInputAt: 0,
      createdAt: Date.now(),
    });
  }
  return lesson2SessionStates.get(id)!;
}
