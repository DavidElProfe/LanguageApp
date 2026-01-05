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
      // LOG DE INICIO
      console.log(
        `\n🌊 [FLUJO INICIO] Sesión: ${input.sessionId} | Pregunta: "${input.currentQuestion}"`,
      );
      console.log(`🗣️ [INPUT USUARIO]: "${input.transcription}"`);

      // Step 1: Run Grammar and Verifier agents IN PARALLEL
      const [grammarResult, verifierResult] = await Promise.all([
        grammarAgent.process(input),
        verifierAgent.process(input),
      ]);

      agentsInvoked.push("grammar", "verifier");

      // --- LOGS DEL PASO 1 (GRAMMAR) ---
      console.log(`\n📘 [GRAMMAR AGENT]:`);
      console.log(
        `   - Tiene Errores: ${grammarResult.data.hasErrors ? "SÍ ❌" : "NO ✅"}`,
      );
      if (grammarResult.data.hasErrors) {
        console.log(
          `   - Corrección: "${grammarResult.data.correctedTranscription}"`,
        );
        // SAFEGUARD: Intentamos leer 'feedback' o 'feedbackInSpanish' para evitar undefined
        const grammarFeedback =
          (grammarResult.data as any).feedback ||
          (grammarResult.data as any).feedbackInSpanish ||
          "Sin feedback";
        console.log(`   - Feedback: "${grammarFeedback}"`);
      } else {
        console.log(`   - Assessment: ${grammarResult.data.overallAssessment}`);
      }

      // --- LOGS DEL PASO 1 (VERIFIER) ---
      console.log(`\n📙 [VERIFIER AGENT]:`);
      console.log(
        `   - ¿Es relevante?: ${verifierResult.data.isRelevant ? "SÍ ✅" : "NO ❌"} (Score: ${verifierResult.data.relevanceScore})`,
      );
      console.log(`   - Tipo: ${verifierResult.data.responseType}`);

      // SAFEGUARD CRÍTICO (Aquí era el error):
      // Aseguramos que reasoning sea un string antes de hacer substring
      const verifierReasoning =
        verifierResult.data.reasoning || "No reasoning provided";
      console.log(
        `   - Razonamiento: "${verifierReasoning.substring(0, 100)}..."`,
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

      // --- LOGS DEL PASO 3 (JUDGE) ---
      console.log(`\n⚖️ [JUDGE AGENT] (Decisión Final):`);
      console.log(
        `   - Decisión: "${judgeResult.data.decision.toUpperCase()}" (Confianza: ${judgeResult.data.confidence})`,
      );
      console.log(
        `   - ¿Avanzar?: ${judgeResult.data.shouldAdvance ? "SÍ ⏩" : "NO 🛑"}`,
      );
      console.log(`   - Instrucción al Tutor:`);
      console.log(`     👉 "${judgeResult.data.tutorInstruction}"`);
      console.log(`--------------------------------------------------\n`);

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
          grammarResult: grammarResult, // Pasamos el objeto Result completo (incluye tiempos)
          verifierResult: verifierResult,
          judgeResult: judgeResult,
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
          "Lo siento, hubo un error técnico. Por favor, repite tu respuesta.",
        processingTimeMs: Date.now() - startTime,
        agentsInvoked,
      };
    }
  }
}

export const analysisOrchestrator = new AnalysisOrchestrator();
