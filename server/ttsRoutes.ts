import { Router } from "express";
import { generateTTSAudio, streamTTSAudio, TTSVoice } from "./utils/ttsHelper";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "./prompts/lesson2VoiceMvpQuestions";

export const ttsRouter = Router();

ttsRouter.post("/speak", async (req, res) => {
  try {
    const { text, voice = "nova", speed = 1.0, model = "gpt-4o-mini-tts" } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'text' field" });
    }

    console.log(`📢 [TTS API] Request to speak: "${text.substring(0, 50)}..."`);

    const audioBuffer = await generateTTSAudio(text, {
      voice: voice as TTSVoice,
      speed,
      model,
    });

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length.toString(),
      "Cache-Control": "no-cache",
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error("❌ [TTS API] Error:", error);
    res.status(500).json({ error: "Failed to generate speech" });
  }
});

ttsRouter.get("/speak-stream", async (req, res) => {
  try {
    const text = req.query.text as string;
    const voice = (req.query.voice as TTSVoice) || "nova";
    const speed = parseFloat(req.query.speed as string) || 1.0;

    if (!text) {
      return res.status(400).json({ error: "Missing 'text' query parameter" });
    }

    console.log(`📢 [TTS API] Stream request: "${text.substring(0, 50)}..."`);

    const stream = await streamTTSAudio(text, { voice, speed });

    res.set({
      "Content-Type": "audio/mpeg",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });

    const reader = stream.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      await pump();
    };

    await pump();
  } catch (error) {
    console.error("❌ [TTS API] Stream Error:", error);
    res.status(500).json({ error: "Failed to stream speech" });
  }
});

ttsRouter.get("/lesson-question/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const voice = (req.query.voice as TTSVoice) || "nova";
    const speed = parseFloat(req.query.speed as string) || 1.0;

    if (isNaN(index) || index < 0 || index >= LESSON_2_VOICE_MVP_QUESTIONS.length) {
      return res.status(400).json({
        error: "Invalid question index",
        validRange: `0-${LESSON_2_VOICE_MVP_QUESTIONS.length - 1}`,
      });
    }

    const questionText = LESSON_2_VOICE_MVP_QUESTIONS[index];
    console.log(`📢 [TTS API] Lesson question ${index}: "${questionText}"`);

    const audioBuffer = await generateTTSAudio(questionText, { voice, speed });

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length.toString(),
      "X-Question-Text": encodeURIComponent(questionText),
      "X-Question-Index": index.toString(),
      "Cache-Control": "no-cache",
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error("❌ [TTS API] Error:", error);
    res.status(500).json({ error: "Failed to generate question audio" });
  }
});

ttsRouter.get("/questions-list", (_req, res) => {
  res.json({
    totalQuestions: LESSON_2_VOICE_MVP_QUESTIONS.length,
    questions: LESSON_2_VOICE_MVP_QUESTIONS,
  });
});
