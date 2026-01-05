/**
 * Analysis Agent Type Definitions
 *
 * Input/output contracts for the multi-agent analysis system.
 * Used by Grammar, Verifier, and Judge agents.
 */

// ============================================
// INPUT TYPES
// ============================================

export interface AnalysisInput {
  transcription: string;
  currentQuestion: string;
  questionIndex: number;
  lessonNumber: number;
  sessionId: string;
  metadata?: {
    partNumber?: number;
    questionInPart?: number;
  };
}

// ============================================
// GRAMMAR AGENT TYPES
// ============================================

export type GrammarErrorType =
  | "contraction"
  | "verb_form"
  | "article"
  | "preposition"
  | "word_order"
  | "tense"
  | "subject_verb_agreement"
  | "other";

export type GrammarSeverity = "minor" | "moderate" | "major";

export type GrammarAssessment =
  | "excellent"
  | "good"
  | "needs_improvement"
  | "poor";

export interface GrammarError {
  type: GrammarErrorType;
  original: string;
  correction: string;
  explanation: string;
  severity: GrammarSeverity;
}

export interface GrammarAgentOutput {
  hasErrors: boolean;
  errors: GrammarError[];
  overallAssessment: GrammarAssessment;
  correctedTranscription: string;
  feedbackInSpanish: string;
}

export interface GrammarAgentResult {
  success: boolean;
  agentName: "grammar";
  processingTimeMs: number;
  data: GrammarAgentOutput;
}

// ============================================
// VERIFIER AGENT TYPES
// ============================================

export type ResponseType =
  | "direct_answer"
  | "partial_answer"
  | "off_topic"
  | "clarification_needed"
  | "noise";

export interface VerifierAgentOutput {
  answersQuestion: boolean;
  relevanceScore: number;
  responseType: ResponseType;
  expectedResponseHint?: string;
  analysisReason: string;
}

export interface VerifierAgentResult {
  success: boolean;
  agentName: "verifier";
  processingTimeMs: number;
  data: VerifierAgentOutput;
}

// ============================================
// JUDGE AGENT TYPES
// ============================================

export type JudgeDecision =
  | "advance"
  | "correct_and_retry"
  | "clarify_and_retry"
  | "off_topic_retry"
  | "ignore";

export interface JudgeAgentOutput {
  decision: JudgeDecision;
  confidence: number;
  shouldAdvance: boolean;
  tutorInstruction: string;
  tutorInstructionEnglish?: string;
  reasoning: string;
  grammarFeedback?: string;
}

export interface JudgeAgentResult {
  success: boolean;
  agentName: "judge";
  processingTimeMs: number;
  data: JudgeAgentOutput;
}

export interface JudgeInput extends AnalysisInput {
  grammarAnalysis: GrammarAgentOutput;
  verifierAnalysis: VerifierAgentOutput;
}

// ============================================
// ORCHESTRATOR OUTPUT
// ============================================

export type AnalysisAgentName = "grammar" | "verifier" | "judge";

export interface AnalysisOrchestratorOutput {
  success: boolean;
  decision: JudgeDecision;
  shouldAdvance: boolean;
  tutorInstruction: string;
  grammarFeedback?: string;
  processingTimeMs: number;
  agentsInvoked: AnalysisAgentName[];
  debug?: {
    grammarResult: GrammarAgentOutput;
    verifierResult: VerifierAgentOutput;
    judgeResult: JudgeAgentOutput;
  };
}

// ============================================
// API REQUEST/RESPONSE
// ============================================

export interface AnalyzeRequestBody {
  transcription: string;
  currentQuestion?: string;
  questionIndex: number;
  lessonNumber: number;
  sessionId: string;
  partNumber?: number;
  questionInPart?: number;
  includeDebug?: boolean;
}

export interface AnalyzeResponseBody {
  success: boolean;
  decision: JudgeDecision;
  shouldAdvance: boolean;
  tutorInstruction: string;
  grammarFeedback?: string;
  processingTimeMs: number;
  debug?: AnalysisOrchestratorOutput["debug"];
}
