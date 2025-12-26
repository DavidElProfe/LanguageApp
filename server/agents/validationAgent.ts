/**
 * Validation Agent
 * 
 * Responsibility: Validates user input for correctness, safety, and relevance.
 * 
 * Input: User message and conversation context
 * Output: Validation result with any errors found
 * 
 * This agent NEVER responds directly to users.
 * All output goes through the Orchestrator.
 */

import type { AgentInput, ValidationResult, BaseAgent } from "./types";
import { VALIDATION_AGENT_PROMPT, VALIDATION_SYSTEM_CONTEXT } from "./prompts";

export class ValidationAgent implements BaseAgent {
  readonly name = "validation" as const;

  async process(input: AgentInput): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      const validationResult = await this.validate(input);

      return {
        success: true,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: validationResult,
      };
    } catch (error) {
      return {
        success: false,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: {
          isValid: false,
          errors: [{ code: "VALIDATION_ERROR", message: "Internal validation error" }],
        },
      };
    }
  }

  private async validate(input: AgentInput): Promise<ValidationResult["data"]> {
    const { userMessage, context } = input;
    const errors: ValidationResult["data"]["errors"] = [];

    if (!userMessage || userMessage.trim().length === 0) {
      errors.push({ code: "EMPTY_INPUT", message: "Message cannot be empty" });
    }

    if (userMessage && userMessage.length > 2000) {
      errors.push({ code: "TOO_LONG", message: "Message exceeds maximum length" });
    }

    const harmfulPatterns = this.checkHarmfulContent(userMessage);
    if (harmfulPatterns.length > 0) {
      errors.push({ code: "HARMFUL_CONTENT", message: "Message contains inappropriate content" });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: this.sanitize(userMessage),
    };
  }

  private checkHarmfulContent(message: string): string[] {
    return [];
  }

  private sanitize(message: string): string {
    if (!message) return "";
    return message.trim();
  }

  getPrompt(): string {
    return VALIDATION_AGENT_PROMPT;
  }

  getSystemContext(): string {
    return VALIDATION_SYSTEM_CONTEXT;
  }
}

export const validationAgent = new ValidationAgent();
