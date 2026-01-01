import { Router } from "express";
import OpenAI from "openai";

import { SIMPLE_CONVERSATION_PROMPT } from "./prompts/simpleConversationPrompt";

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

const LESSON_2_TOOLS = [
  {
    type: "function",
    name: "ignore_noise",
    description:
      "CALL THIS if the audio is silence, background noise, coughing, or irrelevant sounds. DO NOT SPEAK.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "process_student_answer",
    description:
      "CALL THIS when the user speaks a deliberate attempt at an answer (even if wrong).",
    parameters: {
      type: "object",
      properties: {
        transcript: {
          type: "string",
          description: "The text transcription of what the user said",
        },
      },
      required: ["transcript"],
    },
  },
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
[SYSTEM BLOCK]
- YOU ARE CURRENTLY RESTRICTED TO QUESTION NUMBER: ${questionIndex}
- EXACT QUESTION TEXT: "${currentQuestion}"
- If the student is correct, your ONLY task is to remain SILENT and wait for the system to give you the next question.
- DO NOT say "Nice to meet you" or "Great".
- DO NOT invent questions about "free time".
- If you are correcting, use the algorithm and then ask ONLY: "${currentQuestion}".
[END BLOCK]
`;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

assistantRouter.get("/simple-session", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("🚀 [BACKEND] GET /simple-session REQUEST RECEIVED");
  console.log("📥 [BACKEND] Query Params:", req.query);

  try {
    const lessonParam = req.query.lesson;
    let lessonNumber = 1;
    if (lessonParam) {
      const parsed = parseInt(lessonParam as string, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 2) {
        lessonNumber = parsed;
      }
    }

    console.log(`ℹ️ [BACKEND] Resolved Lesson Number: ${lessonNumber}`);

    const sessionId = `simple_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`🆔 [BACKEND] Generated Session ID: ${sessionId}`);

    let fullInstructions: string;

    if (lessonNumber === 2) {
      console.log("🛠️ [BACKEND] Configuring LESSON 2 (Strict Mode)");

      const partNumber = parseInt(req.query.part as string, 10) || 1;
      const questionInPart = parseInt(req.query.question as string, 10) || 1;

      const lesson2State = getOrCreateLesson2SessionState(
        sessionId,
        partNumber,
        questionInPart,
      );

      // (Opcional) Log para ver qué pregunta cree el backend que es
      // const currentQuestionText = getLesson2Question(...)

      fullInstructions = `
      ROLE: You are an Audio Routing System.

      BEHAVIOR RULES:
      1. LISTENING MODE (Default): When the user is speaking, listen quietly. 
         - If you hear speech, call the tool "process_student_answer".
         - If you hear noise, call "ignore_noise".

      2. SPEAKING MODE: You are ALLOWED to speak ONLY when you receive a specific command to read text.
         - When commanded to speak, read the text clearly and naturally.
      `;

      console.log(
        "📜 [BACKEND] Lesson 2 Instructions Length:",
        fullInstructions.length,
      );

      // Pasamos true a VAD y las tools
      const response = await createRealtimeSession(
        fullInstructions,
        true,
        LESSON_2_TOOLS,
      );

      console.log("✅ [BACKEND] Lesson 2 Session Created Successfully");

      res.json({
        token: response.client_secret.value,
        mode: "simple",
        lesson: lessonNumber,
        sessionId,
        part: lesson2State.currentPart,
        currentQuestionInPart: lesson2State.currentQuestionInPart,
      });
    } else {
      console.log("🗣️ [BACKEND] Configuring LESSON 1 (Open Mode)");
      const initialIndex =
        parseInt(req.query.initialQuestionIndex as string, 10) || 1;
      const sessionState = getOrCreateSessionState(sessionId, initialIndex);
      const silentContext = generateSilentContext(
        sessionState.currentQuestionIndex,
      );

      fullInstructions = SIMPLE_CONVERSATION_PROMPT + silentContext;

      const response = await createRealtimeSession(fullInstructions, true);

      console.log("✅ [BACKEND] Lesson 1 Session Created Successfully");

      res.json({
        token: response.client_secret.value,
        mode: "simple",
        lesson: lessonNumber,
        sessionId,
        currentQuestionIndex: sessionState.currentQuestionIndex,
      });
    }
  } catch (error: any) {
    console.error(`❌ [BACKEND ERROR]`, error.message);
    res.status(500).json({ error: error.message });
  }
});

async function createRealtimeSession(
  instructions: string,
  useVAD: boolean,
  tools?: any[],
) {
  console.log("⚙️ [BACKEND] Building Session Config...");

  const sessionConfig: any = {
    model: "gpt-4o-realtime-preview-2024-12-17",
    voice: "alloy",
    instructions,
    modalities: ["text", "audio"],
    input_audio_transcription: { model: "whisper-1" },
    temperature: 0.6,
  };

  if (useVAD) {
    sessionConfig.turn_detection = {
      type: "server_vad",
      threshold: 0.8,
      prefix_padding_ms: 500,
      silence_duration_ms: 3000,
    };
  }

  if (tools && tools.length > 0) {
    console.log("🔧 [BACKEND] Injecting Tools & Setting Tool Choice");
    sessionConfig.tools = tools;

    // CAMBIO CRÍTICO: VOLVEMOS A REQUIRED
    // Esto mata el "Processing your answer" inmediatamente.
    sessionConfig.tool_choice = "required";

    console.log("🔒 [BACKEND] tool_choice set to:", sessionConfig.tool_choice);
  } else {
    console.log("🔓 [BACKEND] No tools provided (Free conversation)");
  }

  // LOG CRÍTICO: Ver qué le mandamos exactamente a OpenAI
  console.log(
    "📦 [BACKEND] FINAL CONFIG TO OPENAI:",
    JSON.stringify(
      {
        ...sessionConfig,
        instructions: "HIDDEN (Too long)", // Ocultamos instrucciones para no ensuciar el log
      },
      null,
      2,
    ),
  );

  try {
    const result = await openai.beta.realtime.sessions.create(sessionConfig);
    console.log("📡 [BACKEND] OpenAI API Response ID:", (result as any).id);
    return result;
  } catch (err: any) {
    console.error("🔥 [BACKEND] OpenAI API CRASH:", err);
    throw err;
  }
}

assistantRouter.post(
  "/simple-session/:sessionId/process-response",
  async (req, res) => {
    const { sessionId } = req.params;
    console.log(`🔄 [BACKEND] Process Response for Session: ${sessionId}`);

    const { aiTranscript, studentTranscript } = req.body;
    const sessionState = simpleSessionStates.get(sessionId);

    if (!sessionState) {
      console.warn(
        `⚠️ [PROCESS_ERROR] Session ${sessionId} not found in Memory`,
      );
      return res.status(404).json({ error: "Session not found" });
    }

    const currentIndex = sessionState.currentQuestionIndex;

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
