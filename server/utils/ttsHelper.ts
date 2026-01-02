import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "coral" | "sage";

export interface TTSOptions {
  voice?: TTSVoice;
  speed?: number;
  model?: "tts-1" | "tts-1-hd" | "gpt-4o-mini-tts";
}

export async function generateTTSAudio(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const {
    voice = "nova",
    speed = 1.0,
    model = "gpt-4o-mini-tts",
  } = options;

  console.log(`🔊 [TTS] Generating audio for: "${text.substring(0, 50)}..."`);
  console.log(`🔊 [TTS] Model: ${model}, Voice: ${voice}, Speed: ${speed}`);

  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    speed,
    response_format: "mp3",
  });

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`✅ [TTS] Audio generated: ${buffer.length} bytes`);

  return buffer;
}

export async function streamTTSAudio(
  text: string,
  options: TTSOptions = {}
): Promise<ReadableStream> {
  const {
    voice = "nova",
    speed = 1.0,
    model = "gpt-4o-mini-tts",
  } = options;

  console.log(`🔊 [TTS-STREAM] Starting stream for: "${text.substring(0, 50)}..."`);

  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    speed,
    response_format: "mp3",
  });

  return response.body as unknown as ReadableStream;
}
