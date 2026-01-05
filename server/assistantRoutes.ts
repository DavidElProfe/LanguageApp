import { Router } from "express";
import OpenAI from "openai";

export const assistantRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * GET /simple-session
 * Única responsabilidad: Entregar un Token para conectar el audio en vivo.
 */
assistantRouter.get("/simple-session", async (req, res) => {
  try {
    const lessonParam = req.query.lesson || "1";
    console.log(`🎤 [BACKEND] Generando Token para Lección: ${lessonParam}`);

    // Instrucción "Dummy". El modelo no necesita saber nada porque:
    // 1. Lesson 1: El usuario solo transcribe.
    // 2. Lesson 2: Los agentes deciden qué decir.
    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions: "System: You are a passive transcriber. Listen and wait.",
      modalities: ["text", "audio"],
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: {
        type: "server_vad",
        threshold: 0.6, // Subimos un poco para evitar ruidos de fondo
        prefix_padding_ms: 200, // Menos "colchón" de audio al inicio
        silence_duration_ms: 500, // Corta tras 0.5s de silencio (antes 0.6s)
      },
    });

    console.log("✅ [BACKEND] Token generado con éxito.");

    res.json({
      token: response.client_secret.value,
      sessionId: `sess_${Date.now()}`, // ID simple para logs
    });
  } catch (error: any) {
    console.error(
      "❌ [BACKEND ERROR] No se pudo crear la sesión:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});
