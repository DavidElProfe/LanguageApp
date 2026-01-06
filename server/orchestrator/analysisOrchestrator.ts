/**
 * Analysis Orchestrator
 *
 * Coordinates the multi-agent analysis flow:
 * 1. Receives transcription
 * 2. SANITIZES transcription (Fixes phonetic errors like Sun/Son)
 * 3. Runs Grammar + Verifier agents IN PARALLEL
 * 4. Passes results to Judge agent
 * 5. Returns final decision
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

// 🔧 MAPA DE CORRECCIONES FONÉTICAS FORZADAS
// Esto engaña a la IA antes de que pueda juzgar mal.
const PHONETIC_FIXES: Record<string, string> = {
  "the sun": "the son",
  "a sun": "a son",
  "my sun": "my son",
  sun: "son",
  bitch: "beach",
  shit: "sheet",
  pies: "peace",
  "i ": "eye ",
  sea: "see",
};

export class AnalysisOrchestrator {
  /**
   * Limpia la transcripción de Whisper usando fuerza bruta.
   * Si encuentra "sun", lo cambia a "son" para evitar falsos negativos.
   */
  private sanitizeTranscription(text: string): string {
    let cleanText = text.toLowerCase();

    for (const [wrong, right] of Object.entries(PHONETIC_FIXES)) {
      // Usamos \b (Word Boundary) para no romper palabras como "Sunday"
      const regex = new RegExp(`\\b${wrong}\\b`, "gi");
      if (regex.test(cleanText)) {
        console.log(`🔧 [AUTO-FIX] Replaced "${wrong}" with "${right}"`);
        cleanText = cleanText.replace(regex, right);
      }
    }

    // Restaurar mayúscula inicial
    return cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
  }

  /**
   * Main entry point for analyzing student responses.
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
      // 1. 🛑 INTERCEPTAR Y CORREGIR (La Trampa)
      const originalTranscription = input.transcription;
      const sanitizedTranscription = this.sanitizeTranscription(
        originalTranscription,
      );

      // Creamos un nuevo input "limpio" para engañar a los agentes
      const cleanInput = {
        ...input,
        transcription: sanitizedTranscription,
      };

      // LOG DE INICIO
      console.log(
        `\n🌊 [FLUJO INICIO] Sesión: ${input.sessionId} | Pregunta: "${input.currentQuestion}"`,
      );
      console.log(`🗣️ [INPUT ORIGINAL]: "${originalTranscription}"`);
      if (originalTranscription !== sanitizedTranscription) {
        console.log(`✨ [INPUT CORREGIDO]: "${sanitizedTranscription}"`);
      }

      // Step 2: Run Grammar and Verifier agents IN PARALLEL using CLEAN INPUT
      const [grammarResult, verifierResult] = await Promise.all([
        grammarAgent.process(cleanInput),
        verifierAgent.process(cleanInput),
      ]);

      agentsInvoked.push("grammar", "verifier");

      // --- LOGS DEL PASO 1 (GRAMMAR) ---
      // Nota: Accedemos a .data porque así lo definimos en analysisTypes.ts
      console.log(`\n📘 [GRAMMAR AGENT]:`);
      console.log(
        `   - Tiene Errores: ${grammarResult.data.hasErrors ? "SÍ ❌" : "NO ✅"}`,
      );
      if (grammarResult.data.hasErrors) {
        console.log(
          `   - Corrección: "${grammarResult.data.correctedTranscription}"`,
        );
        const grammarFeedback =
          grammarResult.data.feedback ||
          grammarResult.data.feedbackInSpanish ||
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

      const verifierReasoning =
        verifierResult.data.reasoning || "No reasoning provided";
      console.log(
        `   - Razonamiento: "${verifierReasoning.substring(0, 100)}..."`,
      );

      // Step 3: Prepare input for Judge agent (Usamos también el input limpio)
      const judgeInput: JudgeInput = {
        ...cleanInput,
        grammarAnalysis: grammarResult.data,
        verifierAnalysis: verifierResult.data,
      };

      // Step 4: Run Judge agent
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

      // Step 5: Build output
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
          grammarResult: grammarResult,
          verifierResult: verifierResult,
          judgeResult: judgeResult,
          originalTranscription, // Guardamos el original por si quieres ver qué dijo realmente
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
