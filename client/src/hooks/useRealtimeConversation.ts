import { useState, useRef } from "react";
import { SIMPLE_CONVERSATION_PROMPT } from "../../../server/prompts/simpleConversationPrompt";

import { LESSON_2_VOICE_MVP_PROMPT } from "../../../server/prompts/lesson_2_voice_mvp_prompt";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";

/* =====================================================
    TYPES & CONSTANTS
===================================================== */
type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";
type Lesson1Step = "NAME" | "FROM" | "LIVE" | "WORK" | "LIKE" | "DONE";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

/* =====================================================
    HOOK: useRealtimeConversation
===================================================== */

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

  // 🔒 FLOW CONTROL (claros y separados)
  const waitingForUserRef = useRef(false);

  /* =====================================================
      LESSON 2 – ASK QUESTION (ÚNICA FUENTE DE VERDAD)
  ===================================================== */

  const askLesson2Question = () => {
    const index = currentQuestionIndexRef.current;
    const question = LESSON_2_VOICE_MVP_QUESTIONS[index];

    if (!question || dcRef.current?.readyState !== "open") return;

    dcRef.current.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions: `
${LESSON_2_VOICE_MVP_PROMPT}

SYSTEM:
Ask ONLY this question:
"${question}"

Then STOP and wait.
          `,
          tool_choice: "none",
          temperature: 0.4,
        },
      }),
    );

    dcRef.current.send(JSON.stringify({ type: "response.create" }));

    // 🔴 A partir de acá, SOLO el usuario puede destrabar el flujo
    waitingForUserRef.current = true;
  };

  /* =====================================================
      START CONVERSATION
  ===================================================== */

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
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        setConnectionState("active");

        /* ---------------- LESSON 1 ---------------- */
        if (lesson === 1) {
          const question1Text =
            "Hi, I'm your conversation partner from The Language School. What is your name?";

          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: `
${SIMPLE_CONVERSATION_PROMPT}

CRITICAL:
You must immediately ask:
"${question1Text}"
Wait for the student's response.
                `,
                tool_choice: "none",
                temperature: 0.6,
              },
            }),
          );

          dc.send(JSON.stringify({ type: "response.create" }));
        }

        /* ---------------- LESSON 2 (VOICE MVP) ---------------- */
        if (lesson === 2) {
          currentQuestionIndexRef.current = 0;
          askLesson2Question();
        }
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);

        /* ---------------- USER SPOKE ---------------- */
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        ) {
          // 🚫 Si no estamos esperando usuario, ignoramos
          if (!waitingForUserRef.current) return;

          const text = data.transcript?.trim();
          if (!text || text.length < 2) return;

          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "user",
              text,
              timestamp: Date.now(),
            },
          ]);

          // 🔓 Avanzamos SOLO por input del usuario
          waitingForUserRef.current = false;
          currentQuestionIndexRef.current += 1;

          askLesson2Question();
        }

        /* ---------------- AI FINISHED SPEAKING ---------------- */
        if (data.type === "response.audio_transcript.done") {
          const assistantText = data.transcript?.trim();
          if (!assistantText) return;

          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: assistantText,
              timestamp: Date.now(),
            },
          ]);

          // ❌ NUNCA se avanza acá
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
      setErrorMessage("Error al iniciar la conversación");
    }
  };

  const stopConversation = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    setConnectionState("ended");
  };

  return {
    connectionState,
    errorMessage,
    messages,
    currentLesson: lesson,
    currentStep,
    startConversation,
    stopConversation,
  };
}
