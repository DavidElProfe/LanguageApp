import { Router } from "express";
import OpenAI from "openai";
import { 
  getBasePrompt, 
  getLessonPrompt, 
  validateLesson, 
  TOTAL_LESSONS,
  getLesson1MasterPrompt,
  getLesson1Step,
  type Lesson1Step
} from "./prompts/promptManager";
import { SIMPLE_CONVERSATION_PROMPT } from "./prompts/simpleConversationPrompt";
import { 
  SIMPLE_CONVERSATION_QUESTIONS, 
  TOTAL_QUESTIONS, 
  getQuestionByIndex,
  findQuestionIndex 
} from "./prompts/simpleConversationQuestions";

export const assistantRouter = Router();

interface SimpleSessionState {
  currentQuestionIndex: number;
  lastAdvancedAt: number;
  createdAt: number;
}

const simpleSessionStates = new Map<string, SimpleSessionState>();

function getOrCreateSessionState(sessionId: string, initialIndex: number = 0): SimpleSessionState {
  if (!simpleSessionStates.has(sessionId)) {
    const state: SimpleSessionState = {
      currentQuestionIndex: Math.max(0, Math.min(initialIndex, TOTAL_QUESTIONS)),
      lastAdvancedAt: 0,
      createdAt: Date.now(),
    };
    simpleSessionStates.set(sessionId, state);
    console.log(`[SimpleSession] Created session ${sessionId} at question ${state.currentQuestionIndex}`);
  }
  return simpleSessionStates.get(sessionId)!;
}

function generateSilentContext(questionIndex: number): string {
  if (questionIndex === 0) {
    return `\n\n[INTERNAL ORIENTATION - DO NOT MENTION THIS TO THE STUDENT]\nYou are about to start the conversation. Begin with question 1: "${getQuestionByIndex(1)}"\nDo not reference question numbers aloud. Simply ask the question naturally.\n[END INTERNAL ORIENTATION]\n`;
  }
  return `\n\n[INTERNAL ORIENTATION - DO NOT MENTION THIS TO THE STUDENT]\nYou are currently at question ${questionIndex} of ${TOTAL_QUESTIONS}.\nThe current question is: "${getQuestionByIndex(questionIndex)}"\nDo not reference question numbers aloud. Simply ask the question naturally.\n[END INTERNAL ORIENTATION]\n`;
}

setInterval(() => {
  const now = Date.now();
  const MAX_SESSION_AGE = 2 * 60 * 60 * 1000;
  const entries = Array.from(simpleSessionStates.entries());
  for (const [sessionId, state] of entries) {
    if (now - state.createdAt > MAX_SESSION_AGE) {
      simpleSessionStates.delete(sessionId);
      console.log(`[SimpleSession] Cleaned up expired session ${sessionId}`);
    }
  }
}, 15 * 60 * 1000);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

assistantRouter.get("/realtime-token", async (req, res) => {
  try {
    const lessonParam = req.query.lesson;
    const stepParam = req.query.step as Lesson1Step | undefined;
    let lessonNumber = 1;
    
    if (lessonParam) {
      const parsed = parseInt(lessonParam as string, 10);
      if (!isNaN(parsed) && validateLesson(parsed)) {
        lessonNumber = parsed;
      }
    }
    
    const basePrompt = getBasePrompt();
    
    let fullInstructions: string;
    let isStepBased = false;
    let initialStep: Lesson1Step = "NAME";
    
    if (lessonNumber === 1) {
      isStepBased = true;
      const masterPrompt = getLesson1MasterPrompt();
      const step = stepParam || "NAME";
      initialStep = step;
      const stepPrompt = getLesson1Step(step);
      fullInstructions = basePrompt;
      console.log(`Creating realtime session for Lesson 1, Step: ${step}`);
      
      res.json({
        token: (await openai.beta.realtime.sessions.create({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "alloy",
          instructions: basePrompt,
          modalities: ["text", "audio"],
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 900,
          },
          input_audio_transcription: {
            model: "whisper-1",
            language: "en",
          },
        })).client_secret.value,
        lesson: lessonNumber,
        basePrompt: basePrompt,
        masterPrompt: masterPrompt,
        stepPrompt: stepPrompt,
        totalLessons: TOTAL_LESSONS,
        isStepBased: true,
        currentStep: initialStep,
      });
      return;
    } else {
      const lessonPrompt = getLessonPrompt(lessonNumber);
      fullInstructions = basePrompt + "\n\n" + lessonPrompt;
      console.log(`Creating realtime session for Lesson ${lessonNumber}`);
    }

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: basePrompt,
      modalities: ["text", "audio"],
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 900,
      },
      input_audio_transcription: {
        model: "whisper-1",
        language: "en",
      },
    });

    res.json({
      token: response.client_secret.value,
      lesson: lessonNumber,
      fullInstructions: fullInstructions,
      totalLessons: TOTAL_LESSONS,
      isStepBased: isStepBased,
      currentStep: isStepBased ? initialStep : null,
    });
  } catch (error: any) {
    console.error("Error creating realtime session:", error);
    res.status(500).json({
      error: "Failed to create realtime session",
      message: error.message,
    });
  }
});

assistantRouter.get("/lesson1-step", (req, res) => {
  const stepParam = req.query.step as Lesson1Step;
  if (!stepParam) {
    return res.status(400).json({ error: "Step parameter required" });
  }
  
  const stepPrompt = getLesson1Step(stepParam);
  res.json({ step: stepParam, stepPrompt });
});

assistantRouter.get("/simple-session", async (req, res) => {
  try {
    console.log("=== SIMPLE SESSION REQUEST ===");
    
    const initialQuestionIndexParam = req.query.initialQuestionIndex;
    let initialQuestionIndex = 0;
    
    if (initialQuestionIndexParam) {
      const parsed = parseInt(initialQuestionIndexParam as string, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= TOTAL_QUESTIONS) {
        initialQuestionIndex = parsed;
        console.log(`[SimpleSession] Starting at custom question index: ${initialQuestionIndex}`);
      }
    }
    
    const sessionId = `simple_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const sessionState = getOrCreateSessionState(sessionId, initialQuestionIndex);
    
    const silentContext = generateSilentContext(sessionState.currentQuestionIndex);
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
        language: "en",
      },
    });

    console.log("OPENAI_RESPONSE_OK - Session created, token length:", response.client_secret?.value?.length);
    console.log(`[SimpleSession] Session ${sessionId} ready at question ${sessionState.currentQuestionIndex}`);
    
    res.json({
      token: response.client_secret.value,
      mode: "simple",
      instructionsIncluded: true,
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
      error: "Failed to create simple session",
      message: error.message,
      openai_error_code: error.code,
      openai_error_type: error.type,
    });
  }
});

assistantRouter.post("/simple-session/:sessionId/process-response", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { aiTranscript } = req.body;
    
    if (!aiTranscript || typeof aiTranscript !== "string") {
      return res.status(400).json({ error: "aiTranscript is required" });
    }
    
    const sessionState = simpleSessionStates.get(sessionId);
    if (!sessionState) {
      console.log(`[SimpleSession] Session ${sessionId} not found, creating new state`);
      return res.status(404).json({ error: "Session not found" });
    }
    
    const currentIndex = sessionState.currentQuestionIndex;
    const detectedIndex = findQuestionIndex(aiTranscript);
    
    console.log(`[SimpleSession] Processing response for session ${sessionId}`);
    console.log(`[SimpleSession] Current index: ${currentIndex}, Detected in AI response: ${detectedIndex}`);
    
    let advanced = false;
    let newIndex = currentIndex;
    
    const now = Date.now();
    const timeSinceLastAdvance = now - sessionState.lastAdvancedAt;
    const MIN_ADVANCE_INTERVAL = 2000;
    
    if (detectedIndex !== null && timeSinceLastAdvance >= MIN_ADVANCE_INTERVAL) {
      if (detectedIndex === currentIndex + 1) {
        sessionState.currentQuestionIndex = detectedIndex;
        sessionState.lastAdvancedAt = now;
        newIndex = detectedIndex;
        advanced = true;
        console.log(`[SimpleSession] Advanced to question ${newIndex}`);
      } else if (detectedIndex === currentIndex) {
        console.log(`[SimpleSession] AI repeated question ${currentIndex}, not advancing`);
      } else if (detectedIndex > currentIndex + 1) {
        console.log(`[SimpleSession] WARNING: AI tried to skip to question ${detectedIndex}, staying at ${currentIndex}`);
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
    console.error("[SimpleSession] Error processing response:", error);
    res.status(500).json({ error: "Failed to process response", message: error.message });
  }
});

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

interface TextChatMessage {
  role: "user" | "assistant";
  content: string;
}

assistantRouter.post("/text-chat", async (req, res) => {
  try {
    const { message, lesson, history } = req.body;
    
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }
    
    let lessonNumber = 1;
    if (lesson) {
      const parsed = parseInt(lesson, 10);
      if (!isNaN(parsed) && validateLesson(parsed)) {
        lessonNumber = parsed;
      }
    }
    
    const basePrompt = getBasePrompt();
    
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
    
    if (lessonNumber === 1) {
      const masterPrompt = getLesson1MasterPrompt();
      const stepPrompt = getLesson1Step("NAME");
      messages.push({ role: "system", content: basePrompt });
      messages.push({ role: "assistant", content: masterPrompt + "\n\n" + stepPrompt });
    } else {
      const lessonPrompt = getLessonPrompt(lessonNumber);
      messages.push({ role: "system", content: basePrompt });
      messages.push({ role: "assistant", content: lessonPrompt });
    }
    
    if (history && Array.isArray(history)) {
      for (const msg of history as TextChatMessage[]) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    
    messages.push({ role: "user", content: message });
    
    console.log(`Text chat for Lesson ${lessonNumber}: "${message.substring(0, 50)}..."`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 500,
      temperature: 0.3,
    });
    
    const assistantMessage = response.choices[0]?.message?.content || "Lo siento, no pude generar una respuesta.";
    
    res.json({
      response: assistantMessage,
      lesson: lessonNumber,
    });
  } catch (error: any) {
    console.error("Error in text chat:", error);
    res.status(500).json({
      error: "Failed to get response",
      message: error.message,
    });
  }
});
