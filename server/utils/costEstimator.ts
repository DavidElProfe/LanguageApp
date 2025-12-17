/**
 * OpenAI Realtime API Cost Estimator
 * 
 * Pricing (as of Dec 2024 for gpt-4o-realtime-preview):
 * - Audio input: $100 per 1M tokens (~$0.06/minute)
 * - Audio output: $200 per 1M tokens (~$0.24/minute)
 * - Text input (instructions): $5 per 1M tokens
 * 
 * Audio token rate: ~1,500-1,700 tokens per minute of audio
 * We use 1,600 tokens/minute as average.
 * 
 * Assumptions:
 * - 50% of session time is user speaking (input)
 * - 50% of session time is AI speaking (output)
 * - Instructions sent once at session start (~1,500 tokens)
 */

const MODEL_NAME = "gpt-4o-realtime-preview";

// Pricing per 1M tokens
const AUDIO_INPUT_PRICE_PER_1M = 100;   // $100/1M tokens
const AUDIO_OUTPUT_PRICE_PER_1M = 200;  // $200/1M tokens
const TEXT_INPUT_PRICE_PER_1M = 5;      // $5/1M tokens

// Estimated tokens per minute of audio
const AUDIO_TOKENS_PER_MINUTE = 1600;

// Estimated instruction tokens (system prompt)
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
  
  // Estimate audio tokens (50% input, 50% output)
  const totalAudioTokens = durationMinutes * AUDIO_TOKENS_PER_MINUTE;
  const inputTokens = Math.round(totalAudioTokens * 0.5);
  const outputTokens = Math.round(totalAudioTokens * 0.5);
  const textTokens = ESTIMATED_INSTRUCTION_TOKENS;
  
  // Calculate costs
  const audioInputCost = (inputTokens / 1_000_000) * AUDIO_INPUT_PRICE_PER_1M;
  const audioOutputCost = (outputTokens / 1_000_000) * AUDIO_OUTPUT_PRICE_PER_1M;
  const textCost = (textTokens / 1_000_000) * TEXT_INPUT_PRICE_PER_1M;
  
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
  console.log("=== SESSION COST ESTIMATE ===");
  console.log(JSON.stringify(estimate, null, 2));
  console.log("=============================");
}
