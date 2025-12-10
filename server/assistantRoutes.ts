import { Router } from "express";
import OpenAI from "openai";
import { loadSessionContext } from "./ai/context";
import { buildRealtimeSystemPrompt } from "./ai/flowEngine";
import { storage } from "./storage";

export const assistantRouter = Router();

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

assistantRouter.get("/realtime-token", async (req, res) => {
  try {
    const assistantId = "asst_uoHk8D6G4ZPtYrb6lwueR0uh";
    
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    
    console.log("Retrieved assistant:", {
      id: assistant.id,
      model: assistant.model,
      name: assistant.name,
    });
    
    const customInstructions = `${assistant.instructions || 'You are a friendly English language tutor helping Spanish speakers practice English conversation.'}

IMPORTANT: Always assume the student is at Level 1 (beginner). Do NOT ask about their lesson level or what level they are at. Start the conversation directly with a simple, friendly greeting and beginner-appropriate topics.`;

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: customInstructions,
      modalities: ["text", "audio"],
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      },
      input_audio_transcription: {
        model: "whisper-1"
      }
    });

    res.json({ 
      token: response.client_secret.value,
    });
  } catch (error: any) {
    console.error("Error creating realtime session:", error);
    res.status(500).json({ 
      error: "Failed to create realtime session",
      message: error.message 
    });
  }
});

assistantRouter.post("/realtime-session", async (req, res) => {
  try {
    const { userId, topicId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const aiSession = await storage.startAiSession(userId);
    const sessionId = aiSession.id;

    console.log("Created AI session:", sessionId);

    const context = await loadSessionContext(userId, sessionId, topicId);

    console.log("Loaded context:", {
      state: context.state,
      topicTitle: context.topicTitle,
      lessonTitle: context.lessonTitle,
      courseTitle: context.courseTitle,
    });

    const { systemPrompt, state } = buildRealtimeSystemPrompt(context);

    console.log("Built system prompt for state:", state);

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: systemPrompt,
      modalities: ["text", "audio"],
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      },
      input_audio_transcription: {
        model: "whisper-1"
      }
    });

    res.json({
      ephemeral_token: response.client_secret.value,
      sessionId,
      state,
      initialPrompt: systemPrompt,
      context: {
        topicTitle: context.topicTitle,
        lessonTitle: context.lessonTitle,
        courseTitle: context.courseTitle,
      },
    });
  } catch (error: any) {
    console.error("Error creating curriculum-based realtime session:", error);
    res.status(500).json({
      error: "Failed to create realtime session",
      message: error.message,
    });
  }
});
