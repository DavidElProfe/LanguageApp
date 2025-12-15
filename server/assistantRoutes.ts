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

export const assistantRouter = Router();

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
