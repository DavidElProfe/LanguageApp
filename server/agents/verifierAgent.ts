/**
 * Verifier Agent
 *
 * Responsibility: Check if student's response answers the current question.
 * Uses GPT-4o for semantic understanding.
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

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: VERIFIER_SYSTEM_CONTEXT },
          {
            role: "user",
            content: `${VERIFIER_AGENT_PROMPT}

Analyze this response:
Transcription: "${input.transcription}"
Current Question: "${input.currentQuestion}"

Respond with valid JSON only.`,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from GPT-4o");
      }

      const data: VerifierAgentOutput = JSON.parse(content);

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
          relevanceScore: 0,
          responseType: "noise",
          analysisReason: "Error analyzing response",
        },
      };
    }
  }
}

export const verifierAgent = new VerifierAgent();
