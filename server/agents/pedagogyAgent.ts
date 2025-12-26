/**
 * Pedagogy Agent
 * 
 * Responsibility: Explains language concepts, mistakes, and provides
 * educational guidance to learners.
 * 
 * Input: User message with potential errors or questions
 * Output: Educational explanation with examples
 * 
 * This agent NEVER responds directly to users.
 * All output goes through the Orchestrator.
 */

import type { AgentInput, PedagogyResult, BaseAgent } from "./types";
import { PEDAGOGY_AGENT_PROMPT, PEDAGOGY_SYSTEM_CONTEXT } from "./prompts";

export class PedagogyAgent implements BaseAgent {
  readonly name = "pedagogy" as const;

  async process(input: AgentInput): Promise<PedagogyResult> {
    const startTime = Date.now();

    try {
      const explanation = await this.generateExplanation(input);

      return {
        success: true,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: explanation,
      };
    } catch (error) {
      return {
        success: false,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: {
          explanation: "Unable to provide explanation at this time.",
          difficulty: "medium",
        },
      };
    }
  }

  private async generateExplanation(input: AgentInput): Promise<PedagogyResult["data"]> {
    const { userMessage, context } = input;

    // TODO: Integrate with OpenAI or other LLM service
    // This is a stub implementation that would be replaced with actual LLM call

    const analysis = this.analyzeForPedagogy(userMessage, context);

    return {
      explanation: analysis.explanation,
      concept: analysis.concept,
      examples: analysis.examples,
      difficulty: analysis.difficulty,
    };
  }

  private analyzeForPedagogy(
    userMessage: string,
    context: AgentInput["context"]
  ): PedagogyResult["data"] {
    // Stub analysis - to be replaced with LLM integration
    const language = context.language;

    if (language === "es") {
      return {
        explanation: "Tu respuesta muestra buen progreso. Sigue practicando.",
        concept: "Conversación básica",
        examples: ["Ejemplo 1", "Ejemplo 2"],
        difficulty: "easy",
      };
    }

    return {
      explanation: "Your response shows good progress. Keep practicing.",
      concept: "Basic conversation",
      examples: ["Example 1", "Example 2"],
      difficulty: "easy",
    };
  }

  getPrompt(): string {
    return PEDAGOGY_AGENT_PROMPT;
  }

  getSystemContext(): string {
    return PEDAGOGY_SYSTEM_CONTEXT;
  }
}

export const pedagogyAgent = new PedagogyAgent();
