import { useState, useRef, useCallback } from "react";
import { SIMPLE_CONVERSATION_PROMPT } from "../../../server/prompts/simpleConversationPrompt";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";
type Lesson1Step = "NAME" | "FROM" | "LIVE" | "WORK" | "LIKE" | "DONE";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

async function speakWithTTS(text: string): Promise<void> {
  console.log(`🔊 [TTS] Speaking: "${text}"`);
  
  try {
    const response = await fetch("/api/tts/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: "nova",
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      throw new Error(`TTS request failed: ${response.statusText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(audioUrl);
    
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        console.log(`✅ [TTS] Finished speaking: "${text.substring(0, 30)}..."`);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch(reject);
    });
  } catch (error) {
    console.error("❌ [TTS] Error:", error);
    throw error;
  }
}

export function useRealtimeConversation({ lesson = 1, part = 1 } = {}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentStep] = useState<Lesson1Step>("NAME");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const currentQuestionIndexRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);

  const isProcessingRef = useRef<boolean>(false);
  const isTTSSpeakingRef = useRef<boolean>(false);

  /* =====================================================
      HELPER: FORCE AI SPEECH (TITIRITERO) - LESSON 1 ONLY
  ===================================================== */
  const forceAISpeech = (textToSay: string) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") return;

    console.log(`🔵 [TITIRITERO] Ordenando: "${textToSay}"`);

    dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));

    dcRef.current.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
          instructions: `READ THIS EXACTLY: "${textToSay}"`,
          tool_choice: "none",
        },
      }),
    );
  };

  /* =====================================================
      HELPER: SPEAK WITH TTS - LESSON 2 ONLY (HYBRID MODE)
  ===================================================== */
  const speakLesson2TTS = useCallback(async (text: string) => {
    if (isTTSSpeakingRef.current) {
      console.log("⏳ [TTS] Already speaking, skipping...");
      return;
    }

    isTTSSpeakingRef.current = true;

    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: text,
        timestamp: Date.now(),
      },
    ]);

    try {
      await speakWithTTS(text);
    } catch (error) {
      console.error("❌ [TTS] Speech failed:", error);
    } finally {
      isTTSSpeakingRef.current = false;
    }
  }, []);

  const startConversation = async () => {
    try {
      setConnectionState("connecting");

      const tokenRes = await fetch(
        `/api/assistant/simple-session?lesson=${lesson}&part=${part}`,
      );
      const response = await tokenRes.json();
      sessionIdRef.current = response.sessionId;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      
      // =====================================================
      // LESSON 2 HYBRID: Mute Realtime audio output
      // We still need the audio element for WebRTC to work,
      // but we mute it so TTS can be the only voice output
      // =====================================================
      if (lesson === 2) {
        audio.muted = true;
        console.log("🔇 [HYBRID] Lesson 2: Realtime audio MUTED (TTS will be used)");
      }
      
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("✅ [DC] OPEN");
        setConnectionState("active");

        if (lesson === 1) {
          const question1Text =
            "Hi, I'm your conversation partner. What is your name?";
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: `${SIMPLE_CONVERSATION_PROMPT} \n Ask: "${question1Text}"`,
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        }

        if (lesson === 2) {
          // =====================================================
          // LESSON 2 HYBRID: Configure Realtime as listener only
          // =====================================================
          currentQuestionIndexRef.current = 0;

          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions:
                  "System: You are a passive speech-to-text engine. Listen to user speech and transcribe it. Do NOT generate any spoken responses. Do NOT speak at all. Just listen and transcribe.",
                tool_choice: "none",
                temperature: 0.6,
              },
            }),
          );

          const firstQuestion = LESSON_2_VOICE_MVP_QUESTIONS[0];
          console.log(`🎯 [HYBRID] Lesson 2 starting with TTS: "${firstQuestion}"`);
          
          setTimeout(() => {
            speakLesson2TTS(firstQuestion);
          }, 500);
        }
      };

      dc.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        // =====================================================
        // LESSON 2 HYBRID: Cancel ALL Realtime voice responses
        // =====================================================
        if (lesson === 2) {
          if (data.type === "input_audio_buffer.speech_stopped") {
            console.log("🤫 [HYBRID] Speech stopped -> Canceling any Realtime response");
            dc.send(JSON.stringify({ type: "response.cancel" }));
          }

          if (data.type === "response.created") {
            console.log("🚫 [HYBRID] Realtime tried to respond -> Canceling immediately");
            dc.send(JSON.stringify({ type: "response.cancel" }));
          }
        }

        // ==========================================================
        // TRANSCRIPTION HANDLER (works for both lessons)
        // ==========================================================
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const userText = data.transcript.trim();

          if (!userText) return;

          if (lesson === 2) {
            // Skip if TTS is currently speaking (echo filter)
            if (isTTSSpeakingRef.current) {
              console.log("🛡️ [HYBRID] Ignoring input while TTS speaking");
              return;
            }

            // Echo filter: ignore if user text matches current question
            const currentQ =
              LESSON_2_VOICE_MVP_QUESTIONS[currentQuestionIndexRef.current];
            if (
              currentQ &&
              userText
                .toLowerCase()
                .includes(currentQ.toLowerCase().substring(0, 15))
            ) {
              console.log("🛡️ [HYBRID] Echo detected, ignoring");
              return;
            }

            if (isProcessingRef.current) return;
            isProcessingRef.current = true;

            console.log(`👤 [USER] "${userText}"`);
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: userText,
                timestamp: Date.now(),
              },
            ]);

            // Advance to next question
            const nextIndex = currentQuestionIndexRef.current + 1;
            currentQuestionIndexRef.current = nextIndex;
            const nextQuestion = LESSON_2_VOICE_MVP_QUESTIONS[nextIndex];

            // Small delay for natural conversation feel
            setTimeout(() => {
              isProcessingRef.current = false;
              if (nextQuestion) {
                // Speak the EXACT scripted question - no extra words
                speakLesson2TTS(nextQuestion);
              }
              // If no next question, lesson is complete - "Take care!" was the last spoken line
              // No additional speech needed - conversation ends naturally
            }, 500);
          } else {
            // Lesson 1: Just add to messages, Realtime handles the rest
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: userText,
                timestamp: Date.now(),
              },
            ]);
          }
        }

        // Lesson 1: Show AI responses in transcript
        if (lesson === 1 && data.type === "response.audio_transcript.done") {
          const aiText = data.transcript;
          if (aiText && aiText.trim() !== "") {
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                text: aiText,
                timestamp: Date.now(),
              },
            ]);
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
    }
  };

  const stopConversation = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
  };

  const requestSessionRecap = () => {
    // For Lesson 2, don't add extra speech - the script ends with "Take care!"
    // For Lesson 1, provide a friendly closing via Realtime
    if (lesson !== 2) {
      forceAISpeech("Great job today! Keep practicing to improve your English.");
    }
  };

  return {
    connectionState,
    errorMessage,
    messages,
    currentLesson: lesson,
    currentStep,
    startConversation,
    stopConversation,
    requestSessionRecap,
  };
}
