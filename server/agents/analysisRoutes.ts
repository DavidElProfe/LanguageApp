import { Router, type Request, type Response } from "express";
import { analysisOrchestrator } from "../orchestrator/analysisOrchestrator";
import type { AnalyzeRequestBody, AnalyzeResponseBody } from "./types/analysisTypes";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../prompts/lesson2VoiceMvpQuestions";
import { LESSON_3_QUESTIONS } from "../prompts/Lesson3Questions";

export const analysisRouter = Router();

analysisRouter.post("/evaluate", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body: AnalyzeRequestBody = req.body;

  const {
    transcription,
    currentQuestion,
    questionIndex,
    lessonNumber = 2,
    sessionId,
    partNumber,
    questionInPart,
    includeDebug = false,
  } = body;

  console.log(`\n\n=============================================================`);
  console.log(`🗣️  [INICIO] Session: ${sessionId?.slice(-6) || "N/A"} | Lesson: ${lessonNumber}`);
  console.log(`=============================================================`);

  try {
    if (!transcription || transcription.trim().length < 2) {
      console.log("❌ [IGNORADO] Transcripción vacía o muy corta.");
      return res.json({
        success: true,
        decision: "ignore",
        shouldAdvance: false,
        tutorInstruction: "",
        processingTimeMs: 0,
      } as AnalyzeResponseBody);
    }

    let resolvedQuestion = currentQuestion;

    if (!resolvedQuestion) {
      if (lessonNumber === 3) {
        resolvedQuestion = LESSON_3_QUESTIONS[questionIndex];
      } else {
        resolvedQuestion = LESSON_2_VOICE_MVP_QUESTIONS[questionIndex];
      }
    }

    resolvedQuestion = resolvedQuestion || "Unknown question";

    console.log(`🤖 PREGUNTA IA:  "${resolvedQuestion}"`);
    console.log(`🎙️  USUARIO DIJO: "${transcription}"`);
    console.log(`-------------------------------------------------------------`);

    const result = await analysisOrchestrator.analyze(
      {
        transcription: transcription.trim(),
        currentQuestion: resolvedQuestion,
        questionIndex,
        lessonNumber,
        sessionId: sessionId || "unknown",
        metadata: {
          partNumber,
          questionInPart,
        },
      },
      includeDebug,
    );

    const processingTime = Date.now() - startTime;

    console.log(`⚖️  DECISIÓN:     [ ${result.decision.toUpperCase()} ]`);
    console.log(`⏩ AVANZAR:      ${result.shouldAdvance ? "SÍ ✅" : "NO ❌"}`);
    console.log(`💬 FEEDBACK:     "${result.tutorInstruction}"`);
    console.log(`⏱️  TIEMPO:       ${processingTime}ms`);
    console.log(`=============================================================\n`);

    const response: AnalyzeResponseBody = {
      success: result.success,
      decision: result.decision,
      shouldAdvance: result.shouldAdvance,
      tutorInstruction: result.tutorInstruction,
      grammarFeedback: result.grammarFeedback,
      processingTimeMs: result.processingTimeMs,
    };

    if (includeDebug && result.debug) {
      response.debug = result.debug;
    }

    res.json(response);
  } catch (error: unknown) {
    console.error("🔥 [ERROR] Route error:", error);
    res.status(500).json({
      success: false,
      decision: "ignore",
      shouldAdvance: false,
      tutorInstruction: "Lo siento, hubo un error. Intenta de nuevo.",
      processingTimeMs: 0,
    });
  }
});