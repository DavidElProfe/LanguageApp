import { useState, useRef, useCallback } from "react";

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "coral" | "sage";

export interface TTSOptions {
  voice?: TTSVoice;
  speed?: number;
}

export interface UseTTSPlayerReturn {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  speak: (text: string, options?: TTSOptions) => Promise<void>;
  speakLessonQuestion: (index: number, options?: TTSOptions) => Promise<void>;
  stop: () => void;
}

export function useTTSPlayer(): UseTTSPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const speak = useCallback(async (text: string, options: TTSOptions = {}) => {
    cleanup();
    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔊 [TTS Client] Speaking: "${text.substring(0, 50)}..."`);

      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: options.voice || "nova",
          speed: options.speed || 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      currentUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsPlaying(true);
        setIsLoading(false);
      };

      audio.onended = () => {
        cleanup();
      };

      audio.onerror = () => {
        setError("Audio playback failed");
        cleanup();
      };

      await audio.play();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown TTS error";
      console.error("❌ [TTS Client] Error:", message);
      setError(message);
      setIsLoading(false);
    }
  }, [cleanup]);

  const speakLessonQuestion = useCallback(async (index: number, options: TTSOptions = {}) => {
    cleanup();
    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔊 [TTS Client] Speaking lesson question ${index}`);

      const params = new URLSearchParams({
        voice: options.voice || "nova",
        speed: (options.speed || 1.0).toString(),
      });

      const response = await fetch(`/api/tts/lesson-question/${index}?${params}`);

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
      }

      const questionText = decodeURIComponent(response.headers.get("X-Question-Text") || "");
      console.log(`📝 [TTS Client] Question text: "${questionText}"`);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      currentUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsPlaying(true);
        setIsLoading(false);
      };

      audio.onended = () => {
        cleanup();
      };

      audio.onerror = () => {
        setError("Audio playback failed");
        cleanup();
      };

      await audio.play();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown TTS error";
      console.error("❌ [TTS Client] Error:", message);
      setError(message);
      setIsLoading(false);
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    isPlaying,
    isLoading,
    error,
    speak,
    speakLessonQuestion,
    stop,
  };
}
