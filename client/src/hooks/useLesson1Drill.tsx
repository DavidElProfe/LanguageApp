import { useState, useRef, useCallback } from "react";
import { LESSON_1_QUESTIONS } from "../../../server/prompts/Lesson1Questions";
import { aiApi } from "../lib/api";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// CACHÉ GLOBAL (Persiste entre renderizados para velocidad)
const audioCache = new Map<number, Blob>();

export function useLesson1Drill() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const messagesRef = useRef<ConversationMessage[]>([]);
  const currentQuestionIndexRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);

  // CRONÓMETRO DE DEBUG
  const timingRef = useRef<{ stopSpeaking: number }>({ stopSpeaking: 0 });

  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, text, timestamp: Date.now() },
    ]);
  };

  const playAudioBlob = (blob: Blob, label: string): Promise<void> => {
    const startPlay = performance.now();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return new Promise<void>((resolve) => {
      audio.onended = () => {
        resolve();
        URL.revokeObjectURL(url);
      };
      audio.onplay = () => {
        console.log(
          `🔊 [AUDIO PLAY] ${label} started. Latency from play call: ${(performance.now() - startPlay).toFixed(0)}ms`,
        );
      };
      audio.play().catch((e) => console.error("Error playing audio:", e));
    });
  };

  const speakDynamicText = async (text: string) => {
    if (isTTSSpeakingRef.current) return;
    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;
    try {
      const t0 = performance.now();
      console.log(`REQUESTING DYNAMIC TTS...`);
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      });
      const t1 = performance.now();
      console.log(`⬇️ [TTS DOWNLOAD] Took ${(t1 - t0).toFixed(0)}ms`);

      const blob = await response.blob();
      await playAudioBlob(blob, "Dynamic Feedback");
    } catch (e) {
      console.error(e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  const speakQuestionByIndex = async (index: number) => {
    if (isTTSSpeakingRef.current) return;
    const text = LESSON_1_QUESTIONS[index];
    if (!text) return;

    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;

    try {
      let blob = audioCache.get(index);
      if (blob) {
        console.log(`⚡ [CACHE HIT] Q${index} ready immediately.`);
        await playAudioBlob(blob, `Question ${index}`);
      } else {
        console.log(`🐢 [CACHE MISS] Downloading Q${index}...`);
        const t0 = performance.now();
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
        });
        const t1 = performance.now();
        console.log(`⬇️ [TTS DOWNLOAD] Took ${(t1 - t0).toFixed(0)}ms`);
        blob = await response.blob();
        audioCache.set(index, blob);
        await playAudioBlob(blob, `Question ${index}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  };

  const prefetchNextQuestion = async (currentIndex: number) => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= LESSON_1_QUESTIONS.length || audioCache.has(nextIdx)) return;

    console.log(`🚀 [PREFETCH START] Q${nextIdx}`);
    try {
      const text = LESSON_1_QUESTIONS[nextIdx];
      await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
      })
        .then((res) => res.blob())
        .then((blob) => {
          audioCache.set(nextIdx, blob);
          console.log(`🏁 [PREFETCH DONE] Q${nextIdx} cached.`);
        });
    } catch (e) {
      console.warn(e);
    }
  };

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setMessages([]);
      setIsThinking(false);
      audioCache.clear();

      // --- 📱 FIX CRÍTICO PARA MÓVIL (iOS/Android) ---
      // Creamos el audio y reproducimos silencio INMEDIATAMENTE al hacer click.
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;

      // CORRECCIÓN TYPESCRIPT: Usamos setAttribute
      audioEl.setAttribute("playsinline", "true");

      // Base64 de un archivo WAV de silencio cortísimo
      audioEl.src =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAGZGF0YQQAAAAAAA==";

      // Intentamos reproducir ya mismo para desbloquear el audio context
      audioEl.play().catch((e) => console.log("Audio warm-up prevented:", e));

      document.body.appendChild(audioEl);
      audioRef.current = audioEl;
      // ------------------------------------------------

      const tokenRes = await fetch(`/api/assistant/simple-session?lesson=1`);
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Conectamos el stream al elemento de audio que ya creamos arriba
      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current
            .play()
            .catch((e) => console.error("Stream play failed", e));
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        setConnectionState("active");
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions:
                "System: You are a passive transcriber. Listen and transcribe. Do NOT speak.",
              tool_choice: "none",
              temperature: 0.6,
            },
          }),
        );
        setTimeout(() => {
          speakQuestionByIndex(0);
          prefetchNextQuestion(0);
        }, 500);
      };

      dc.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type === "input_audio_buffer.speech_started") {
          console.log("🎤 [USER START SPEAKING]");
          prefetchNextQuestion(currentQuestionIndexRef.current);
          return;
        }

        if (data.type === "input_audio_buffer.speech_stopped") {
          timingRef.current.stopSpeaking = performance.now();
          console.log("🛑 [USER STOP SPEAKING] Waiting for transcript...");
          dc.send(JSON.stringify({ type: "response.cancel" }));
        }

        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();
          const tTranscript = performance.now();
          console.log(
            `📝 [TRANSCRIPT READY] "${userText}" (+${(tTranscript - timingRef.current.stopSpeaking).toFixed(0)}ms from stop)`,
          );

          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current)
            return;

          const currentQ = LESSON_1_QUESTIONS[currentQuestionIndexRef.current];
          if (
            currentQ &&
            userText
              .toLowerCase()
              .includes(currentQ.toLowerCase().substring(0, 15))
          )
            return;

          isProcessingRef.current = true;
          addMessage("user", userText);
          setIsThinking(true);

          try {
            console.log("🧠 [AGENTS START] Sending to backend...");
            const tStartAnalysis = performance.now();

            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: 1,
            });

            const tEndAnalysis = performance.now();
            console.log(
              `🧠 [AGENTS END] Took ${(tEndAnalysis - tStartAnalysis).toFixed(0)}ms`,
            );

            if (analysisResult.tutorInstruction) {
              console.log("🗣️ [FEEDBACK] Playing correction...");
              await speakDynamicText(analysisResult.tutorInstruction);
            }

            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;
              if (nextIdx < LESSON_1_QUESTIONS.length) {
                currentQuestionIndexRef.current = nextIdx;
                console.log("⏩ [ADVANCE] Playing next question...");
                await speakQuestionByIndex(nextIdx);
              } else {
                stopConversation();
              }
            }
          } catch (error) {
            console.error("Analysis Error:", error);
          } finally {
            isProcessingRef.current = false;
            setIsThinking(false);
            console.log(
              `🏁 [TURN COMPLETED] Total time: ${(performance.now() - timingRef.current.stopSpeaking).toFixed(0)}ms`,
            );
          }
        }
      };

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
    } catch (err) {
      console.error(err);
      setConnectionState("error");
    }
  };

  const stopConversation = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
    setIsThinking(false);
  };

  return {
    connectionState,
    errorMessage,
    messages,
    isThinking,
    startConversation,
    stopConversation,
  };
}
