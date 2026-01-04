import { Router, type Request, type Response } from "express";
import { analysisOrchestrator } from "../orchestrator/analysisOrchestrator";
import type { AnalyzeRequestBody, AnalyzeResponseBody } from "./types/analysisTypes";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../prompts/lesson2VoiceMvpQuestions";

export const analysisRouter = Router();

analysisRouter.post("/evaluate", async (req: Request, res: Response) => {
  try {
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

    if (!transcription || transcription.trim().length < 2) {
      return res.json({
        success: true,
        decision: "ignore",
        shouldAdvance: false,
        tutorInstruction: "",
        processingTimeMs: 0,
      } as AnalyzeResponseBody);
    }

    const resolvedQuestion =
      currentQuestion ||
      LESSON_2_VOICE_MVP_QUESTIONS[questionIndex] ||
      "Unknown question";

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

    console.log(
      `[ANALYSIS] Response for session ${sessionId}: decision=${result.decision}, advance=${result.shouldAdvance}`,
    );

    res.json(response);
  } catch (error: unknown) {
    console.error("[ANALYSIS] Route error:", error);
    res.status(500).json({
      success: false,
      decision: "ignore",
      shouldAdvance: false,
      tutorInstruction: "Lo siento, hubo un error. Intenta de nuevo.",
      processingTimeMs: 0,
    });
  }
});
