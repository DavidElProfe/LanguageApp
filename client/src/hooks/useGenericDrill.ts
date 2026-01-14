import { useState, useRef, useCallback, useEffect } from "react";
import { aiApi } from "../lib/api";
import { LESSONS_CONFIG } from "@/data/lesson";

// ============================================================================
// TYPES
// ============================================================================
type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// Global Audio Cache (Persists across re-renders)
const audioCache = new Map<string, Blob>();

/**
 * Main hook for managing voice interactive lessons.
 * Handles WebRTC connection, VAD (Voice Activity Detection), and lesson lifecycle.
 */
export function useGenericDrill(lessonId: number) {
  const config = LESSONS_CONFIG[lessonId];

  // --------------------------------------------------------------------------
  // 1. STATE & REFS
  // --------------------------------------------------------------------------
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  // WebRTC & Media
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Session Logic
  const currentQuestionIndexRef = useRef<number>(0);
  const sessionMistakesRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string | null>(null);

  // Flags
  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);
  const timingRef = useRef<{ stopSpeaking: number }>({ stopSpeaking: 0 });

  // --------------------------------------------------------------------------
  // 2. HELPER FUNCTIONS (Audio & UI)
  // --------------------------------------------------------------------------

  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, text, timestamp: Date.now() },
    ]);
  };

  const playAudioBlob = (blob: Blob, label: string): Promise<void> => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return new Promise<void>((resolve) => {
      audio.onended = () => {
        resolve();
        URL.revokeObjectURL(url);
      };
      audio.play().catch((e) => console.error("🔊 [Audio Error]:", e));
    });
  };

  /**
   * Generates dynamic audio for immediate tutor feedback.
   */
  const speakDynamicText = async (text: string) => {
    if (isTTSSpeakingRef.current) return;
    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;
    try {
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      const blob = await response.blob();
      await playAudioBlob(blob, "Dynamic Feedback");
    } catch (e) {
      console.error("❌ [TTS Error]", e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  /**
   * Plays a predefined question (using cache if available).
   */
  const speakQuestionByIndex = async (index: number) => {
    if (!config) return;
    if (isTTSSpeakingRef.current) return;

    const text = config.questions[index];
    if (!text) return;

    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;

    const cacheKey = `${lessonId}-${index}`;

    try {
      let blob = audioCache.get(cacheKey);
      if (blob) {
        console.log(`⚡ [CACHE HIT] Question ${index}`);
        await playAudioBlob(blob, `Question ${index}`);
      } else {
        console.log(`🐢 [CACHE MISS] Downloading Question ${index}...`);
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
        });
        blob = await response.blob();
        audioCache.set(cacheKey, blob);
        await playAudioBlob(blob, `Question ${index}`);
      }
    } catch (e) {
      console.error("❌ [TTS Error]", e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  /**
   * Silently downloads the next audio to reduce latency.
   */
  const prefetchNextQuestion = async (currentIndex: number) => {
    if (!config) return;
    const nextIdx = currentIndex + 1;
    const cacheKey = `${lessonId}-${nextIdx}`;

    if (nextIdx >= config.questions.length || audioCache.has(cacheKey)) return;

    try {
      const text = config.questions[nextIdx];
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      const blob = await response.blob();
      audioCache.set(cacheKey, blob);
      console.log(`📥 [PREFETCH] Question ${nextIdx} cached.`);
    } catch (e) {
      console.warn("⚠️ [Prefetch Warning]", e);
    }
  };

  // --------------------------------------------------------------------------
  // 3. CORE LOGIC (WebRTC Connection)
  // --------------------------------------------------------------------------

  const startConversation = useCallback(async () => {
    if (!config) {
      setErrorMessage("Lesson config not found");
      return;
    }

    try {
      setConnectionState("connecting");
      setMessages([]);
      setIsThinking(false);
      setErrorMessage("");

      // Reset local state
      sessionMistakesRef.current.clear();
      currentQuestionIndexRef.current = 0;

      // 1. Get Session Token
      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lessonId}`,
      );
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      // 2. Setup WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Audio Element (HTML)
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      // Microphone Configuration
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Data Channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      // --- HANDLER: Connection Opened ---
      dc.onopen = () => {
        setConnectionState("active");

        // Send initial configuration (System Prompt)
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: config.systemPrompt,
              tool_choice: "none",
              temperature: 0.6,
              voice: "shimmer",
              input_audio_transcription: { model: "whisper-1" },
            },
          }),
        );

        // Start drill with a small delay for stability
        setTimeout(() => {
          console.log(`🚀 [START] Lesson ${lessonId} - "${config.title}"`);
          speakQuestionByIndex(0);
          prefetchNextQuestion(0);
        }, 500);
      };

      // --- HANDLER: Incoming Messages ---
      dc.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // A. User started speaking (VAD)
        if (data.type === "input_audio_buffer.speech_started") {
          console.log("🎤 [USER START]");
          prefetchNextQuestion(currentQuestionIndexRef.current);
          return;
        }

        // B. User stopped speaking
        if (data.type === "input_audio_buffer.speech_stopped") {
          timingRef.current.stopSpeaking = performance.now();
          console.log("🛑 [USER STOP]");
          dc.send(JSON.stringify({ type: "response.cancel" }));
        }

        // C. Transcription completed (Whisper)
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();
          console.log(`📝 [TRANSCRIPT] "${userText}"`);

          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current)
            return;

          const currentQ = config.questions[currentQuestionIndexRef.current];

          // Anti-echo filter (if user repeats the question)
          if (
            currentQ &&
            userText
              .toLowerCase()
              .includes(currentQ.toLowerCase().substring(0, 15))
          ) {
            return;
          }

          // --- BACKEND EVALUATION ---
          isProcessingRef.current = true;
          addMessage("user", userText);
          setIsThinking(true);

          try {
            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: lessonId,
            });

            // Tutor feedback
            if (analysisResult.tutorInstruction) {
              await speakDynamicText(analysisResult.tutorInstruction);
            }

            // Error tracking
            if (analysisResult.decision === "correct_and_retry") {
              if (currentQ) sessionMistakesRef.current.add(currentQ);
            }

            // Advance question
            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;
              if (nextIdx < config.questions.length) {
                currentQuestionIndexRef.current = nextIdx;
                await speakQuestionByIndex(nextIdx);
              } else {
                handleLessonEnd();
              }
            }
          } catch (error) {
            console.error("❌ [Eval Error]", error);
          } finally {
            isProcessingRef.current = false;
            setIsThinking(false);
          }
        }
      };

      // 3. SDP Negotiation
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${response.token}`,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
          body: offer.sdp,
        },
      );
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpRes.text(),
      });
    } catch (err: any) {
      console.error("❌ [Connection Failed]", err);
      setErrorMessage("Connection failed: " + err.message);
      setConnectionState("error");
    }
  }, [lessonId, config]);

  // --------------------------------------------------------------------------
  // 4. CLEANUP & ENDING
  // --------------------------------------------------------------------------

  const handleLessonEnd = async () => {
    const mistakes = Array.from(sessionMistakesRef.current);

    // Fallback message while AI thinks
    console.log("🧠 [AI] Generating Summary...");
    let finalMsg = "Great job! You finished the lesson.";

    // Logic for sending errors to AI summary (if endpoint is available)
    if (mistakes.length > 0) {
      const reviewList = mistakes
        .map((m) => m.replace(/How do you say|in English\?/gi, "").trim())
        .slice(0, 3);
      finalMsg = `Good practice! Try to review these words: ${reviewList.join(", ")}.`;
    }

    // Uncomment if using the new summary endpoint:
    // const aiSummary = await aiApi.generateSessionSummary(config.title, mistakes);
    // if (aiSummary) finalMsg = aiSummary;

    await speakDynamicText(finalMsg);
    stopConversation();
  };

  const stopConversation = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
    setIsThinking(false);
  }, []);

  useEffect(() => {
    return () => stopConversation();
  }, [stopConversation]);

  return {
    connectionState,
    errorMessage,
    messages,
    isThinking,
    startConversation,
    stopConversation,
  };
}
