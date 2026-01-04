/**
 * Analysis Orchestrator
 *
 * Coordinates the multi-agent analysis flow:
 * 1. Receives transcription and question context
 * 2. Runs Grammar + Verifier agents IN PARALLEL
 * 3. Passes results to Judge agent
 * 4. Returns final decision
 */

import { grammarAgent } from "../agents/grammarAgent";
import { verifierAgent } from "../agents/verifierAgent";
import { judgeAgent } from "../agents/judgeAgent";
import type {
  AnalysisInput,
  AnalysisOrchestratorOutput,
  AnalysisAgentName,
  JudgeInput,
} from "../agents/types/analysisTypes";

export class AnalysisOrchestrator {
  /**
   * Main entry point for analyzing student responses.
   *
   * Flow:
   * 1. Run Grammar + Verifier agents in parallel
   * 2. Wait for both to complete
   * 3. Pass results to Judge agent
   * 4. Return final decision
   */
  async analyze(
    input: AnalysisInput,
    includeDebug = false,
  ): Promise<AnalysisOrchestratorOutput> {
    const startTime = Date.now();
    const agentsInvoked: AnalysisAgentName[] = [];

    // Validate input
    if (!input.transcription || input.transcription.trim().length < 2) {
      return {
        success: true,
        decision: "ignore",
        shouldAdvance: false,
        tutorInstruction: "",
        processingTimeMs: Date.now() - startTime,
        agentsInvoked: [],
      };
    }

    try {
      // Step 1: Run Grammar and Verifier agents IN PARALLEL
      console.log(
        `[ANALYSIS] Starting parallel analysis for session ${input.sessionId}`,
      );

      const [grammarResult, verifierResult] = await Promise.all([
        grammarAgent.process(input),
        verifierAgent.process(input),
      ]);

      agentsInvoked.push("grammar", "verifier");

      console.log(
        `[ANALYSIS] Grammar: ${grammarResult.data.overallAssessment}, Verifier: ${verifierResult.data.responseType}`,
      );

      // Step 2: Prepare input for Judge agent
      const judgeInput: JudgeInput = {
        ...input,
        grammarAnalysis: grammarResult.data,
        verifierAnalysis: verifierResult.data,
      };

      // Step 3: Run Judge agent
      const judgeResult = await judgeAgent.process(judgeInput);
      agentsInvoked.push("judge");

      console.log(
        `[ANALYSIS] Judge decision: ${judgeResult.data.decision} (confidence: ${judgeResult.data.confidence})`,
      );

      // Step 4: Build output
      const output: AnalysisOrchestratorOutput = {
        success: true,
        decision: judgeResult.data.decision,
        shouldAdvance: judgeResult.data.shouldAdvance,
        tutorInstruction: judgeResult.data.tutorInstruction,
        grammarFeedback: judgeResult.data.grammarFeedback,
        processingTimeMs: Date.now() - startTime,
        agentsInvoked,
      };

      // Include debug info if requested
      if (includeDebug) {
        output.debug = {
          grammarResult: grammarResult.data,
          verifierResult: verifierResult.data,
          judgeResult: judgeResult.data,
        };
      }

      return output;
    } catch (error: unknown) {
      console.error("[ANALYSIS] Orchestrator error:", error);
      return {
        success: false,
        decision: "ignore",
        shouldAdvance: false,
        tutorInstruction:
          "Lo siento, hubo un error. Por favor, repite tu respuesta.",
        processingTimeMs: Date.now() - startTime,
        agentsInvoked,
      };
    }
  }
}

export const analysisOrchestrator = new AnalysisOrchestrator();
