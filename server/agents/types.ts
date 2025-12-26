/**
 * Multi-Agent Architecture Type Definitions
 * 
 * This file defines the input/output contracts for all agents in the system.
 * All agents communicate through the Orchestrator using these standardized interfaces.
 */

export interface AgentInput {
  userMessage: string;
  conversationHistory: ConversationMessage[];
  context: AgentContext;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: Date;
}

export interface AgentContext {
  userId?: string;
  lessonId?: number;
  currentStep?: string;
  language: "en" | "es";
  metadata?: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  data: unknown;
  agentName: string;
  processingTimeMs?: number;
}

export interface ValidationResult extends AgentOutput {
  data: {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedInput?: string;
  };
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ConversationResult extends AgentOutput {
  data: {
    response: string;
    suggestedFollowUp?: string;
    confidence: number;
  };
}

export interface PedagogyResult extends AgentOutput {
  data: {
    explanation: string;
    concept?: string;
    examples?: string[];
    difficulty: "easy" | "medium" | "hard";
  };
}

export interface ControlResult extends AgentOutput {
  data: {
    allowed: boolean;
    reason?: string;
    suggestedAction?: string;
    violations: string[];
  };
}

export type AgentType = "validation" | "conversation" | "pedagogy" | "control";

export interface OrchestratorInput {
  userMessage: string;
  conversationHistory: ConversationMessage[];
  context: AgentContext;
}

export interface OrchestratorOutput {
  finalResponse: string;
  agentsInvoked: AgentType[];
  processingTimeMs: number;
  metadata: {
    validationPassed: boolean;
    controlPassed: boolean;
    pedagogyUsed: boolean;
  };
}

export interface BaseAgent {
  name: AgentType;
  process(input: AgentInput): Promise<AgentOutput>;
}
