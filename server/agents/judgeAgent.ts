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
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: JUDGE_SYSTEM_CONTEXT },
          {
            role: "user",
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
        temperature: 0.3,
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
