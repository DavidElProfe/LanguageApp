/**
 * Judge Agent
 * RESPONSIBILITY: Tomar la decisión final basada en el input de Grammar y Verifier.
 */

import OpenAI from "openai";
import type {
  JudgeAgentResult,
  JudgeAgentOutput,
  JudgeInput,
} from "./types/analysisTypes";
import {
  JUDGE_AGENT_PROMPT,
  JUDGE_SYSTEM_CONTEXT,
} from "./prompts/judgePrompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class JudgeAgent {
  readonly name = "judge" as const;

  async process(input: JudgeInput): Promise<JudgeAgentResult> {
    const startTime = Date.now();

    try {
      // 🧠 LÓGICA DINÁMICA: MODO ESTRICTO (Solo Lección 3)
      let dynamicContext = "";
      
      if (input.lessonNumber === 3) {
        console.log("⚖️ [JUDGE] ¡MODO ESTRICTO ACTIVADO! (Strict Data Validation)");
        
        dynamicContext = `
        🚨 CRITICAL OVERRIDE FOR LESSON 3 (STRICT MODE):
        
        1. TRUST THE VERIFIER IMPLICITLY:
           - In this lesson, we are validating exact numbers, prices, and translations.
           - If the Verifier Analysis says "answersQuestion": false (or isRelevant: false), you MUST decide "CORRECT_AND_RETRY".
           - Do NOT be lenient. Do NOT advance if the number/price is wrong.
           
        2. IGNORE "NEARLY CORRECT":
           - If the user says "Three" but the answer is "Four", Verifier will reject it. You MUST reject it too.
           
        3. TRANSLATIONS:
           - If Verifier approves the translation, verify grammar is acceptable. If yes, ADVANCE.
        `;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            // Aquí inyectamos el veneno (las reglas estrictas) solo si es necesario
            content: JUDGE_SYSTEM_CONTEXT + "\n\n" + dynamicContext 
          },
          {
            role: "user",
            // Mantenemos tu estructura original intacta
            content: `${JUDGE_AGENT_PROMPT}

Context:
- Student's transcription: "${input.transcription}"
- Current question: "${input.currentQuestion}"

Grammar Analysis:
${JSON.stringify(input.grammarAnalysis, null, 2)}

Verifier Analysis:
${JSON.stringify(input.verifierAnalysis, null, 2)}

Respond with valid JSON only.`,
          },
        ],
        // Bajamos la temperatura para evitar que se ponga creativo perdonando errores
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_tokens: 250,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from GPT-4o");
      }

      const data: JudgeAgentOutput = JSON.parse(content);

      return {
        success: true,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data,
      };
    } catch (error: unknown) {
      console.error("Judge Agent error:", error);
      return {
        success: false,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: {
          decision: "ignore",
          confidence: 0,
          shouldAdvance: false,
          tutorInstruction: "",
          reasoning: "Error processing judgment",
        },
      };
    }
  }
}

export const judgeAgent = new JudgeAgent();