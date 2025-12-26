/**
 * Control Agent
 * 
 * Responsibility: Enforces system rules, constraints, and platform policies.
 * Acts as a guardrail for the entire conversation system.
 * 
 * Input: Proposed response and conversation context
 * Output: Approval/rejection with reasoning
 * 
 * This agent NEVER responds directly to users.
 * All output goes through the Orchestrator.
 */

import type { AgentInput, ControlResult, BaseAgent } from "./types";
import { CONTROL_AGENT_PROMPT, CONTROL_SYSTEM_CONTEXT } from "./prompts";

export class ControlAgent implements BaseAgent {
  readonly name = "control" as const;

  async process(input: AgentInput): Promise<ControlResult> {
    const startTime = Date.now();

    try {
      const controlResult = await this.enforceRules(input);

      return {
        success: true,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: controlResult,
      };
    } catch (error) {
      return {
        success: false,
        agentName: this.name,
        processingTimeMs: Date.now() - startTime,
        data: {
          allowed: false,
          reason: "Control check failed",
          violations: ["INTERNAL_ERROR"],
        },
      };
    }
  }

  private async enforceRules(input: AgentInput): Promise<ControlResult["data"]> {
    const { userMessage, context } = input;
    const violations: string[] = [];

    // Check for personal information requests
    if (this.containsPersonalInfoRequest(userMessage)) {
      violations.push("PERSONAL_INFO_REQUEST");
    }

    // Check language consistency
    if (!this.isCorrectLanguage(userMessage, context.language)) {
      // Note: This is a soft check - learners may mix languages
    }

    // Check for off-topic content
    if (this.isOffTopic(userMessage, context)) {
      violations.push("OFF_TOPIC");
    }

    const allowed = violations.length === 0;

    return {
      allowed,
      reason: allowed ? undefined : "Content violates platform rules",
      suggestedAction: allowed ? undefined : "Please stay on topic with the lesson",
      violations,
    };
  }

  private containsPersonalInfoRequest(message: string): boolean {
    // Stub - would implement actual detection
    const sensitivePatterns = [
      /phone\s*number/i,
      /credit\s*card/i,
      /social\s*security/i,
      /address/i,
      /password/i,
    ];

    return sensitivePatterns.some((pattern) => pattern.test(message));
  }

  private isCorrectLanguage(message: string, expectedLanguage: "en" | "es"): boolean {
    // Stub - would implement actual language detection
    return true;
  }

  private isOffTopic(message: string, context: AgentInput["context"]): boolean {
    // Stub - would implement actual topic detection
    return false;
  }

  getPrompt(): string {
    return CONTROL_AGENT_PROMPT;
  }

  getSystemContext(): string {
    return CONTROL_SYSTEM_CONTEXT;
  }
}

export const controlAgent = new ControlAgent();
