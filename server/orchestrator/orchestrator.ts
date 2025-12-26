/**
 * Orchestrator
 * 
 * Central decision-maker for the multi-agent system.
 * 
 * Responsibilities:
 * 1. Receives user input and conversation state
 * 2. Decides which specialized agents to invoke
 * 3. Coordinates agent execution flow
 * 4. Aggregates responses into a final output
 * 
 * Design Principles:
 * - Agents NEVER call each other directly
 * - All inter-agent communication goes through the Orchestrator
 * - Clear input/output contracts are enforced
 * - Processing flow is deterministic and traceable
 */

import {
  validationAgent,
  conversationAgent,
  pedagogyAgent,
  controlAgent,
} from "../agents";

import type {
  OrchestratorInput,
  OrchestratorOutput,
  AgentInput,
  AgentType,
  ValidationResult,
  ConversationResult,
  PedagogyResult,
  ControlResult,
} from "../agents/types";

export class Orchestrator {
  private readonly agentsInvoked: AgentType[] = [];

  /**
   * Main entry point for processing user messages.
   * 
   * Flow:
   * 1. Validate input
   * 2. Check control rules
   * 3. Generate conversation response
   * 4. Apply pedagogy if needed
   * 5. Final control check on response
   * 6. Return aggregated result
   */
  async process(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const startTime = Date.now();
    const agentsInvoked: AgentType[] = [];

    const agentInput: AgentInput = {
      userMessage: input.userMessage,
      conversationHistory: input.conversationHistory,
      context: input.context,
    };

    // Step 1: Validate user input
    const validationResult = await this.runValidation(agentInput);
    agentsInvoked.push("validation");

    if (!validationResult.data.isValid) {
      return this.createErrorResponse(
        validationResult.data.errors.map((e) => e.message).join(". "),
        agentsInvoked,
        Date.now() - startTime,
        { validationPassed: false, controlPassed: true, pedagogyUsed: false }
      );
    }

    // Step 2: Pre-response control check
    const preControlResult = await this.runControl(agentInput);
    agentsInvoked.push("control");

    if (!preControlResult.data.allowed) {
      return this.createErrorResponse(
        preControlResult.data.suggestedAction || "Request not allowed",
        agentsInvoked,
        Date.now() - startTime,
        { validationPassed: true, controlPassed: false, pedagogyUsed: false }
      );
    }

    // Step 3: Generate conversation response
    const conversationResult = await this.runConversation(agentInput);
    agentsInvoked.push("conversation");

    // Step 4: Apply pedagogy if confidence is low or errors detected
    let pedagogyUsed = false;
    let finalResponse = conversationResult.data.response;

    if (conversationResult.data.confidence < 0.7) {
      const pedagogyResult = await this.runPedagogy(agentInput);
      agentsInvoked.push("pedagogy");
      pedagogyUsed = true;

      // Enhance response with pedagogical content
      finalResponse = this.enhanceWithPedagogy(
        conversationResult.data,
        pedagogyResult.data
      );
    }

    // Step 5: Post-response control check (on the final response)
    const postControlInput: AgentInput = {
      ...agentInput,
      userMessage: finalResponse, // Check the response, not the input
    };

    const postControlResult = await this.runControl(postControlInput);

    if (!postControlResult.data.allowed) {
      // If our response violates rules, use a safe fallback
      finalResponse = this.getSafeResponse(input.context.language);
    }

    return {
      finalResponse,
      agentsInvoked,
      processingTimeMs: Date.now() - startTime,
      metadata: {
        validationPassed: true,
        controlPassed: postControlResult.data.allowed,
        pedagogyUsed,
      },
    };
  }

  private async runValidation(input: AgentInput): Promise<ValidationResult> {
    return validationAgent.process(input);
  }

  private async runConversation(input: AgentInput): Promise<ConversationResult> {
    return conversationAgent.process(input);
  }

  private async runPedagogy(input: AgentInput): Promise<PedagogyResult> {
    return pedagogyAgent.process(input);
  }

  private async runControl(input: AgentInput): Promise<ControlResult> {
    return controlAgent.process(input);
  }

  private enhanceWithPedagogy(
    conversation: ConversationResult["data"],
    pedagogy: PedagogyResult["data"]
  ): string {
    // Combine conversational response with pedagogical explanation
    let enhanced = conversation.response;

    if (pedagogy.explanation) {
      enhanced += `\n\n${pedagogy.explanation}`;
    }

    if (pedagogy.examples && pedagogy.examples.length > 0) {
      enhanced += `\n\nExamples: ${pedagogy.examples.join(", ")}`;
    }

    return enhanced;
  }

  private createErrorResponse(
    message: string,
    agentsInvoked: AgentType[],
    processingTimeMs: number,
    metadata: OrchestratorOutput["metadata"]
  ): OrchestratorOutput {
    return {
      finalResponse: message,
      agentsInvoked,
      processingTimeMs,
      metadata,
    };
  }

  private getSafeResponse(language: "en" | "es"): string {
    if (language === "es") {
      return "Lo siento, no puedo procesar esa solicitud. ¿Podemos continuar con la lección?";
    }
    return "I'm sorry, I can't process that request. Can we continue with the lesson?";
  }
}

export const orchestrator = new Orchestrator();
