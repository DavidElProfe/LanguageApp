/**
 * Grammar Agent
 *
 * Responsibility: Analyze grammatical errors in student's speech.
 * Uses GPT-4o to identify and explain English grammar errors.
 */

import OpenAI from "openai";
import type {
  GrammarAgentResult,
  GrammarAgentOutput,
  AnalysisInput,
} from "./types/analysisTypes";
import {
  GRAMMAR_AGENT_PROMPT,
  GRAMMAR_SYSTEM_CONTEXT,
} from "./prompts/grammarPrompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class GrammarAgent {
  readonly name = "grammar" as const;

  async process(input: AnalysisInput): Promise<GrammarAgentResult> {
    const startTime = Date.now();

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: GRAMMAR_SYSTEM_CONTEXT },
          {
            role: "user",
            content: `${GRAMMAR_AGENT_PROMPT}

Analyze this response:
Transcription: "${input.transcription}"
Current Question: "${input.currentQuestion}"

Respond with valid JSON only.`,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from GPT-4o");
      }

      const data: GrammarAgentOutput = JSON.parse(content);

      return {
        success: true,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data,
      };
    } catch (error: unknown) {
      console.error("Grammar Agent error:", error);
      return {
        success: false,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: {
          hasErrors: false,
          errors: [],
          overallAssessment: "good",
          correctedTranscription: input.transcription,
          feedbackInSpanish: "No se pudo analizar la gramática.",
        },
      };
    }
  }
}

export const grammarAgent = new GrammarAgent();
