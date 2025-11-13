import { Router } from "express";
import OpenAI from "openai";

export const assistantRouter = Router();

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

assistantRouter.get("/realtime-token", async (req, res) => {
  try {
    const assistantId = "asst_uoHk8D6G4ZPtYrb6lwueR0uh";
    
    // Retrieve the custom assistant configuration
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    
    console.log("Retrieved assistant:", {
      id: assistant.id,
      model: assistant.model,
      name: assistant.name,
    });
    
    // Create session with assistant's configuration
    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17", // Realtime API requires this specific model
      voice: "alloy",
      instructions: assistant.instructions || `You are a friendly English language tutor helping Spanish speakers practice English conversation.`,
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
