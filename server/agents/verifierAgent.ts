/**
 * Verifier Agent
 * RESPONSIBILITY: Chequear si la respuesta es relevante y correcta.
 */

import OpenAI from "openai";
import type {
  VerifierAgentResult,
  VerifierAgentOutput,
  AnalysisInput,
} from "./types/analysisTypes";
import {
  VERIFIER_AGENT_PROMPT,
  VERIFIER_SYSTEM_CONTEXT,
} from "./prompts/verifierPrompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class VerifierAgent {
  readonly name = "verifier" as const;

  async process(input: AnalysisInput): Promise<VerifierAgentResult> {
    const startTime = Date.now();
    console.log(`🔎 [VERIFIER] Iniciando análisis...`);

    try {
      let dynamicContext = "";
      let isStrict = false;

      if (input.lessonNumber === 3) {
        isStrict = true;
        console.log("👮 [VERIFIER] ¡MODO ESTRICTO ACTIVADO! (Precios y Cantidades)");
        
        dynamicContext = `
        IMPORTANT - LESSON 3 STRICT RULES (ORDER OF PRIORITY):

        1. TRANSLATIONS (TOP PRIORITY): 
           - If the question is "How do you say [Spanish Phrase]?", the user acts as a translator.
           - EXCEPTIONS: "No entendí" -> "I don't understand" is CORRECT. "Repite por favor" -> "Repeat please" is CORRECT.

        2. DATA VALIDATION (NUMBERS & PRICES): 
           - The question contains the REQUIRED answer in parentheses, e.g., "(5)", "(24)", "($21)".
           - The user MUST say that number.
           - 🧠 EQUIVALENCE RULE: Treat digits ("5") and words ("five") as IDENTICAL.
           - 🧠 PRICE RULE: "($21)" matches "Twenty-one dollars" OR just "Twenty-one".
           
           - Example Q: "How many pillows? (5)" -> User: "There are five pillows" -> CORRECT (isRelevant: true).
           - Example Q: "How many pillows? (5)" -> User: "Three" -> INCORRECT (isRelevant: false).

        3. GENERAL CONVERSATION (FALLBACK):
           - If the question contains NO parentheses and is NOT a translation request.
           - Accept ANY natural, relevant response.
        
        4. JSON FORMAT:
           - You must return "isRelevant" (boolean), "reasoning" (string), "relevanceScore" (number), "responseType" (string).
        `;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: VERIFIER_SYSTEM_CONTEXT + "\n\n" + dynamicContext 
          },
          {
            role: "user",
            content: `${VERIFIER_AGENT_PROMPT}

Analyze this response:
Transcription: "${input.transcription}"
Current Question: "${input.currentQuestion}"

Respond with valid JSON only.`,
          },
        ],
        temperature: 0.1, 
        response_format: { type: "json_object" },
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("No response from GPT-4o");

      const rawData = JSON.parse(content);

      // 🛑 VALORES NORMALIZADOS (Compatibilidad de Tipos)
      const finalIsRelevant = rawData.isRelevant ?? rawData.answersQuestion ?? false;
      const finalReasoning = rawData.reasoning ?? rawData.analysisReason ?? "No reasoning provided";

      const data: VerifierAgentOutput = {
        answersQuestion: finalIsRelevant,
        analysisReason: finalReasoning,
        isRelevant: finalIsRelevant,
        reasoning: finalReasoning,
        relevanceScore: rawData.relevanceScore ?? 0,
        responseType: rawData.responseType ?? "unknown"
      };

      console.log(`🧐 [VERIFIER] Resultado: ${data.isRelevant ? "APROBADO ✅" : "RECHAZADO ❌"}`);
      console.log(`📝 [VERIFIER] Razón: "${data.reasoning}"`);
      if(isStrict) console.log(`👮 [VERIFIER] (Reglas estrictas aplicadas)`);
      
      return {
        success: true,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data,
      };

    } catch (error: unknown) {
      console.error("Verifier Agent error:", error);
      return {
        success: false,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: {
          answersQuestion: false,
          analysisReason: "Error analyzing response",
          isRelevant: false,
          reasoning: "Error analyzing response",
          relevanceScore: 0,
          responseType: "noise",
        },
      };
    }
  }
}

export const verifierAgent = new VerifierAgent();