/**
 * Conversation Agent
 * 
 * Responsibility: Generates domain-specific conversational responses
 * appropriate for language learning contexts.
 * 
 * Input: Validated user message and conversation history
 * Output: Natural language response with confidence score
 * 
 * This agent NEVER responds directly to users.
 * All output goes through the Orchestrator.
 */

import type { AgentInput, ConversationResult, BaseAgent } from "./types";
import { CONVERSATION_AGENT_PROMPT, CONVERSATION_SYSTEM_CONTEXT } from "./prompts";

export class ConversationAgent implements BaseAgent {
  readonly name = "conversation" as const;

  async process(input: AgentInput): Promise<ConversationResult> {
    const startTime = Date.now();

    try {
      const response = await this.generateResponse(input);

      return {
        success: true,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: {
          response: "I'm having trouble responding right now. Please try again.",
          confidence: 0,
        },
      };
    }
  }

  private async generateResponse(input: AgentInput): Promise<ConversationResult["data"]> {
    const { userMessage, conversationHistory, context } = input;

    // TODO: Integrate with OpenAI or other LLM service
    // This is a stub implementation that would be replaced with actual LLM call
    
    const response = this.createStubResponse(userMessage, context);

    return {
      response: response.text,
      suggestedFollowUp: response.followUp,
      confidence: 0.8,
    };
  }

  private createStubResponse(
    userMessage: string,
    context: AgentInput["context"]
  ): { text: string; followUp?: string } {
    // Stub response logic - to be replaced with LLM integration
    const language = context.language;

    if (language === "es") {
      return {
        text: "¡Muy bien! Continúa practicando.",
        followUp: "¿Puedes decirme más?",
      };
    }

    return {
      text: "Great job! Keep practicing.",
      followUp: "Can you tell me more?",
    };
  }

  getPrompt(): string {
    return CONVERSATION_AGENT_PROMPT;
  }

  getSystemContext(): string {
    return CONVERSATION_SYSTEM_CONTEXT;
  }
}

export const conversationAgent = new ConversationAgent();
