/**
 * OpenAI Realtime API Cost Estimator
 * 
 * Pricing approach: Per-minute rates for simplicity and accuracy.
 * 
 * Conservative estimates based on GPT-4o Realtime voice mode:
 * - Audio input (user speaking): ~$0.01/minute
 * - Audio output (AI speaking): ~$0.04/minute
 * - Text (system prompt): negligible (~$0.001 total)
 * 
 * Assumptions:
 * - 50% of session time is user speaking (input)
 * - 50% of session time is AI speaking (output)
 * - System prompt cost is minimal and fixed
 * 
 * Expected result: ~$0.025/minute of conversation
 * A 5-minute session ≈ $0.12-0.15
 */

const MODEL_NAME = "gpt-4o-realtime-preview";

// Per-minute pricing (conservative estimates)
const AUDIO_INPUT_COST_PER_MINUTE = 0.01;   // $0.01/min for user audio
const AUDIO_OUTPUT_COST_PER_MINUTE = 0.04;  // $0.04/min for AI audio
const TEXT_PROMPT_FIXED_COST = 0.001;       // ~$0.001 for system prompt

// Estimated tokens per minute (for logging purposes only)
const AUDIO_TOKENS_PER_MINUTE = 1600;
const ESTIMATED_INSTRUCTION_TOKENS = 1500;

export interface SessionCostEstimate {
  sessionId: string;
  model: string;
  durationMinutes: number;
  inputTokens: number;
  outputTokens: number;
  textTokens: number;
  estimatedCostUSD: number;
  breakdown: {
    audioInputCost: number;
    audioOutputCost: number;
    textCost: number;
  };
  accuracy: string;
}

/**
 * Estimate cost for a Realtime API session based on duration
 */
export function estimateSessionCost(
  sessionId: string,
  startedAt: Date,
  endedAt: Date
): SessionCostEstimate {
  const durationMs = endedAt.getTime() - startedAt.getTime();
  const durationMinutes = durationMs / (1000 * 60);
  
  // Estimate audio tokens (50% input, 50% output) - for logging only
  const totalAudioTokens = durationMinutes * AUDIO_TOKENS_PER_MINUTE;
  const inputTokens = Math.round(totalAudioTokens * 0.5);
  const outputTokens = Math.round(totalAudioTokens * 0.5);
  const textTokens = ESTIMATED_INSTRUCTION_TOKENS;
  
  // Calculate costs using per-minute rates (50/50 split assumption)
  const inputMinutes = durationMinutes * 0.5;
  const outputMinutes = durationMinutes * 0.5;
  
  const audioInputCost = inputMinutes * AUDIO_INPUT_COST_PER_MINUTE;
  const audioOutputCost = outputMinutes * AUDIO_OUTPUT_COST_PER_MINUTE;
  const textCost = TEXT_PROMPT_FIXED_COST;
  
  const estimatedCostUSD = audioInputCost + audioOutputCost + textCost;
  
  return {
    sessionId,
    model: MODEL_NAME,
    durationMinutes: Math.round(durationMinutes * 100) / 100,
    inputTokens,
    outputTokens,
    textTokens,
    estimatedCostUSD: Math.round(estimatedCostUSD * 1000) / 1000,
    breakdown: {
      audioInputCost: Math.round(audioInputCost * 1000) / 1000,
      audioOutputCost: Math.round(audioOutputCost * 1000) / 1000,
      textCost: Math.round(textCost * 10000) / 10000,
    },
    accuracy: "Approximate. Based on session duration with 50/50 input/output split assumption.",
  };
}

/**
 * Log session cost to console in a structured format
 */
export function logSessionCost(estimate: SessionCostEstimate): void {
  // Cost logging removed
}
