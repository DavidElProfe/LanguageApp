/**
 * Analysis Orchestrator
 *
 * Coordinates the multi-agent analysis flow:
 * 1. Receives transcription
 * 2. SANITIZES transcription (Fixes phonetic errors like Sun/Son) -> SKIPPED FOR LESSON 3
 * 3. Runs Grammar + Verifier agents IN PARALLEL
 * 4. Passes results to Judge agent
 * 5. AUDITS the interaction (Quality Gate) <-- ✅ NUEVO PASO AGREGADO
 * 6. Returns final decision
 */

import { grammarAgent } from "../agents/grammarAgent";
import { verifierAgent } from "../agents/verifierAgent";
import { judgeAgent } from "../agents/judgeAgent";
// ✅ 1. IMPORTAMOS EL AUDITOR
import { auditInteraction } from "../services/interactionAuditor";
import type {
  AnalysisInput,
  AnalysisOrchestratorOutput,
  AnalysisAgentName,
  JudgeInput,
} from "../agents/types/analysisTypes";

// 🔧 MAPA DE CORRECCIONES FONÉTICAS FORZADAS
const PHONETIC_FIXES: Record<string, string> = {
  "the sun": "the son",
  "a sun": "a son",
  "my sun": "my son",
  sun: "son",
  bitch: "beach",
  shit: "sheet",
  pies: "peace",
  sea: "see",
};

export class AnalysisOrchestrator {
  private sanitizeTranscription(text: string): string {
    let cleanText = text.toLowerCase();
    for (const [wrong, right] of Object.entries(PHONETIC_FIXES)) {
      const regex = new RegExp(`\\b${wrong}\\b`, "gi");
      if (regex.test(cleanText)) {
        console.log(`🔧 [AUTO-FIX] Replaced "${wrong}" with "${right}"`);
        cleanText = cleanText.replace(regex, right);
      }
    }
    return cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
  }

  async analyze(
    input: AnalysisInput,
    includeDebug = false,
  ): Promise<AnalysisOrchestratorOutput> {
    const startTime = Date.now();
    const agentsInvoked: AnalysisAgentName[] = [];

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
      // 1. 🛑 INTERCEPTAR Y CORREGIR
      const originalTranscription = input.transcription;
      let sanitizedTranscription = originalTranscription;

      if (input.lessonNumber !== 3) {
        sanitizedTranscription = this.sanitizeTranscription(originalTranscription);
      } else {
        console.log("🛡️ [ORCHESTRATOR] Lesson 3 detected: Skipping sanitization.");
      }

      const cleanInput = {
        ...input,
        transcription: sanitizedTranscription,
      };

      console.log(
        `\n🌊 [FLUJO INICIO] Sesión: ${input.sessionId} | Pregunta: "${input.currentQuestion}"`,
      );
      console.log(`🗣️ [INPUT ORIGINAL]: "${originalTranscription}"`);
      
      if (originalTranscription !== sanitizedTranscription) {
        console.log(`✨ [INPUT CORREGIDO]: "${sanitizedTranscription}"`);
      }

      // Step 2: Run Agents
      const [grammarResult, verifierResult] = await Promise.all([
        grammarAgent.process(cleanInput),
        verifierAgent.process(cleanInput),
      ]);

      agentsInvoked.push("grammar", "verifier");

      // LOGS GRAMMAR
      console.log(`\n📘 [GRAMMAR AGENT]:`);
      console.log(`   - Tiene Errores: ${grammarResult.data.hasErrors ? "SÍ ❌" : "NO ✅"}`);
      if (grammarResult.data.hasErrors) {
        console.log(`   - Corrección: "${grammarResult.data.correctedTranscription}"`);
      } else {
        console.log(`   - Assessment: ${grammarResult.data.overallAssessment}`);
      }

      // LOGS VERIFIER
      console.log(`\n📙 [VERIFIER AGENT]:`);
      console.log(`   - ¿Es relevante?: ${verifierResult.data.isRelevant ? "SÍ ✅" : "NO ❌"} (Score: ${verifierResult.data.relevanceScore})`);
      console.log(`   - Razonamiento: "${(verifierResult.data.reasoning || "").substring(0, 100)}..."`);

      // Step 3: Judge Input
      const judgeInput: JudgeInput = {
        ...cleanInput,
        grammarAnalysis: grammarResult.data,
        verifierAnalysis: verifierResult.data,
      };

      // Step 4: Run Judge
      const judgeResult = await judgeAgent.process(judgeInput);
      agentsInvoked.push("judge");

      // LOGS JUDGE
      console.log(`\n⚖️ [JUDGE AGENT] (Decisión Final):`);
      console.log(`   - Decisión: "${judgeResult.data.decision.toUpperCase()}"`);
      console.log(`   - ¿Avanzar?: ${judgeResult.data.shouldAdvance ? "SÍ ⏩" : "NO 🛑"}`);
      console.log(`   - Instrucción al Tutor:`);
      console.log(`     👉 "${judgeResult.data.tutorInstruction}"`);
      console.log(`--------------------------------------------------\n`);

      // ✅ 2. EJECUTAMOS LA AUDITORÍA AQUÍ
      // Esto es lo que faltaba. Se ejecuta en paralelo (sin await) para no frenar la respuesta.
      auditInteraction(
        input.sessionId,
        input.lessonNumber,
        sanitizedTranscription,
        verifierResult.data,
        grammarResult.data,
        judgeResult.data
      ).catch(err => console.error("⚠️ [AUDIT ERROR]", err));

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

      if (includeDebug) {
        output.debug = {
          grammarResult: grammarResult,
          verifierResult: verifierResult,
          judgeResult: judgeResult,
          originalTranscription,
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