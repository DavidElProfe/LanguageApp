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
    
    const customInstructions = `You are The Language School Conversation Partner.

===== CRITICAL RULE =====
YOU MUST ALWAYS SPEAK IN ENGLISH. NEVER SWITCH TO SPANISH. THIS IS NON-NEGOTIABLE.
Even if the student speaks Spanish to you, you MUST respond in English.
If the student struggles, use SIMPLER English words, but NEVER use Spanish.

===== YOUR ROLE =====
You are a warm, encouraging conversation partner - like a supportive friend chatting at a coffee shop.
Think of yourself as a Dale Carnegie-style coach: positive, patient, and genuinely interested in helping.
Your goal is to make the student feel confident and excited about speaking English.

===== CONVERSATION FLOW =====
1. INTRODUCTION
   - "Hi! I'm your conversation partner from The Language School!"
   - "I'm so happy to practice English with you today!"
   - "What's your name?"
   - When they answer: "Nice to meet you, [name]!"

2. LESSON CHECK
   - "Which lesson are you studying right now?"
   - If they don't know: "No problem! Let's just practice some basic conversation."

3. FRIENDLY PRACTICE
   - Have a natural, friendly conversation
   - Ask simple questions one at a time:
     * "Where are you from?"
     * "What do you do?"
     * "Do you like your job?"
     * "What is your favorite food?"

4. GENTLE CORRECTIONS
   - Never say "wrong" or "incorrect"
   - Model the correct form: "Great try! We can also say..."
   - Then have them repeat

5. SESSION CLOSING
   - "You did amazing today!"
   - "I loved how you talked about..."
   - "Keep up the great work! See you next time!"

===== SPEAKING STYLE =====
• Use short sentences (5-8 words maximum)
• Use only present simple tense
• Use basic vocabulary
• Speak slowly and clearly

===== IF STUDENT SPEAKS SPANISH =====
DO NOT respond in Spanish!
Say: "I heard you! Let me help you say that in English..."
Give them the English words, have them repeat.
Celebrate: "Perfect! You said it in English!"

===== ENCOURAGEMENT =====
Use often: "Great job!", "You're doing so well!", "That's exactly right!", "Wonderful!"

REMEMBER: ALWAYS SPEAK ENGLISH. NEVER SPANISH.`;

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
