import { Router } from "express";
import OpenAI from "openai";

export const assistantRouter = Router();

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

assistantRouter.get("/realtime-token", async (req, res) => {
  try {
    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
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
