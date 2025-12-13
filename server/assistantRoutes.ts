import { Router } from "express";
import OpenAI from "openai";
import { getSystemPrompt, validateLesson, TOTAL_LESSONS } from "./prompts/promptManager";

export const assistantRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

assistantRouter.get("/realtime-token", async (req, res) => {
  try {
    const lessonParam = req.query.lesson;
    let lessonNumber = 1;
    
    if (lessonParam) {
      const parsed = parseInt(lessonParam as string, 10);
      if (!isNaN(parsed) && validateLesson(parsed)) {
        lessonNumber = parsed;
      }
    }
    
    const instructions = getSystemPrompt(lessonNumber);
    
    console.log(`Creating realtime session for Lesson ${lessonNumber}`);

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: instructions,
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
      totalLessons: TOTAL_LESSONS,
    });
  } catch (error: any) {
    console.error("Error creating realtime session:", error);
    res.status(500).json({
      error: "Failed to create realtime session",
      message: error.message,
    });
  }
});
