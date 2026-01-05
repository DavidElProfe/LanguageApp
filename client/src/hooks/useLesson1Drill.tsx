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

async function speakWithTTS(text: string) {
  if (!text) return;
  console.log(`[L1 TTS] Speaking: "${text}"`);
  const response = await fetch("/api/tts/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: "nova", speed: 1.0 }),
  });
  if (!response.ok) throw new Error("TTS Failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise<void>((resolve) => {
    audio.onended = () => {
      resolve();
      URL.revokeObjectURL(url);
    };
    audio.play();
  });
}

export function useLesson1Drill() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  // Estado para la burbuja de "Pensando..."
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

  const addMessage = (role: "user" | "assistant", text: string) => {
    const newMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role,
      text,
      timestamp: Date.now(),
    };
    messagesRef.current = [...messagesRef.current, newMsg];
    setMessages((prev) => [...prev, newMsg]);
  };

  const speakText = useCallback(async (text: string) => {
    if (isTTSSpeakingRef.current) return;

    addMessage("assistant", text);
    isTTSSpeakingRef.current = true;
    try {
      await speakWithTTS(text);
    } catch (e) {
      console.error(e);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  }, []);

  const startConversation = async () => {
    try {
      setConnectionState("connecting");
      setMessages([]);
      messagesRef.current = [];
      currentQuestionIndexRef.current = 0;
      setIsThinking(false);

      // Solicitamos sesión especificando lesson=1
      const tokenRes = await fetch(`/api/assistant/simple-session?lesson=1`);
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.muted = true;
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("[L1] Drill Started");
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

        const firstQ = LESSON_1_QUESTIONS[0];
        if (firstQ) {
          setTimeout(() => speakText(firstQ), 500);
        }
      };

      dc.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (
          data.type === "input_audio_buffer.speech_stopped" ||
          data.type === "response.created"
        ) {
          dc.send(JSON.stringify({ type: "response.cancel" }));
        }

        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();

          if (!userText || isTTSSpeakingRef.current || isProcessingRef.current)
            return;

          const currentQ = LESSON_1_QUESTIONS[currentQuestionIndexRef.current];

          // Evitamos procesar si el usuario repite la pregunta (opcional)
          if (
            currentQ &&
            userText
              .toLowerCase()
              .includes(currentQ.toLowerCase().substring(0, 15))
          ) {
            return;
          }

          console.log(`[User Answer L1] ${userText}`);
          isProcessingRef.current = true;
          addMessage("user", userText);

          // Encendemos el indicador de "Pensando"
          setIsThinking(true);

          try {
            // Evaluamos con nuestros Agentes (Backend)
            const analysisResult = await aiApi.evaluateResponse({
              transcription: userText,
              currentQuestion: currentQ || "",
              questionIndex: currentQuestionIndexRef.current,
              sessionId: sessionIdRef.current || "unknown",
              lessonNumber: 1, // <--- Importante: lesson 1
            });

            console.log(
              `[Analysis L1] decision=${analysisResult.decision}, advance=${analysisResult.shouldAdvance}`,
            );

            if (analysisResult.tutorInstruction) {
              await speakText(analysisResult.tutorInstruction);
            }

            if (analysisResult.shouldAdvance) {
              const nextIdx = currentQuestionIndexRef.current + 1;
              if (nextIdx < LESSON_1_QUESTIONS.length) {
                currentQuestionIndexRef.current = nextIdx;
                const nextQ = LESSON_1_QUESTIONS[nextIdx];
                setTimeout(() => speakText(nextQ), 500);
              } else {
                await speakText("¡Felicidades! Has completado la Lección 1.");
                stopConversation();
              }
            } else {
              console.log("[Analysis] Staying on same question (retry)");
            }
          } catch (error) {
            console.error("Analysis Error:", error);
            // Fallback simple por si explota el backend: avanza a la siguiente
            const nextIdx = currentQuestionIndexRef.current + 1;
            if (nextIdx < LESSON_1_QUESTIONS.length) {
              currentQuestionIndexRef.current = nextIdx;
              speakText(LESSON_1_QUESTIONS[nextIdx]);
            }
          } finally {
            isProcessingRef.current = false;
            // Apagamos el indicador
            setIsThinking(false);
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
      setErrorMessage("Error al iniciar");
      setConnectionState("error");
      setIsThinking(false);
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
