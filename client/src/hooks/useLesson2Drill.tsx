import { useState, useRef, useCallback } from "react";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
}

// Helper interno de TTS
async function speakWithTTS(text: string) {
    console.log(`🔊 [L2 TTS] Speaking: "${text}"`);
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

export function useLesson2Drill({ part = 1 } = {}) {
    const [connectionState, setConnectionState] =
        useState<ConnectionState>("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [messages, setMessages] = useState<ConversationMessage[]>([]);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const currentQuestionIndexRef = useRef<number>(0);
    const isProcessingRef = useRef<boolean>(false);
    const isTTSSpeakingRef = useRef<boolean>(false);
    const sessionIdRef = useRef<string | null>(null);

    const speakNextQuestion = useCallback(async (text: string) => {
        if (isTTSSpeakingRef.current) return;
        isTTSSpeakingRef.current = true;
        setMessages((m) => [
            ...m,
            {
                id: crypto.randomUUID(),
                role: "assistant",
                text,
                timestamp: Date.now(),
            },
        ]);
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
            const tokenRes = await fetch(
                `/api/assistant/simple-session?lesson=2&part=${part}`,
            );
            const response = await tokenRes.json();
            sessionIdRef.current = response.sessionId;

            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            // AUDIO MUTEADO (Solo queremos usarlo para enviar microfono)
            const audio = document.createElement("audio");
            audio.autoplay = true;
            audio.muted = true; // <--- SILENCIO TOTAL DEL REALTIME
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
                console.log("✅ [L2] Drill Iniciado");
                setConnectionState("active");

                // CONFIGURACIÓN PASIVA
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

                // Arrancar con TTS
                const firstQ = LESSON_2_VOICE_MVP_QUESTIONS[0];
                setTimeout(() => speakNextQuestion(firstQ), 500);
            };

            dc.onmessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (e) {
                    return;
                }

                // MATAR CUALQUIER INTENTO DE HABLA AUTOMÁTICA
                if (
                    data.type === "input_audio_buffer.speech_stopped" ||
                    data.type === "response.created"
                ) {
                    dc.send(JSON.stringify({ type: "response.cancel" }));
                }

                // TRANSCRIPCIÓN
                if (
                    data.type ===
                    "conversation.item.input_audio_transcription.completed"
                ) {
                    const userText = data.transcript.trim();
                    if (
                        !userText ||
                        isTTSSpeakingRef.current ||
                        isProcessingRef.current
                    )
                        return;

                    // Filtro Eco básico
                    const currentQ =
                        LESSON_2_VOICE_MVP_QUESTIONS[
                            currentQuestionIndexRef.current
                        ];
                    if (
                        currentQ &&
                        userText
                            .toLowerCase()
                            .includes(currentQ.toLowerCase().substring(0, 10))
                    )
                        return;

                    isProcessingRef.current = true;
                    console.log(`👤 [L2 User] ${userText}`);
                    setMessages((m) => [
                        ...m,
                        {
                            id: crypto.randomUUID(),
                            role: "user",
                            text: userText,
                            timestamp: Date.now(),
                        },
                    ]);

                    const nextIdx = currentQuestionIndexRef.current + 1;
                    currentQuestionIndexRef.current = nextIdx;
                    const nextQ = LESSON_2_VOICE_MVP_QUESTIONS[nextIdx];

                    setTimeout(() => {
                        isProcessingRef.current = false;
                        if (nextQ) speakNextQuestion(nextQ);
                    }, 500);
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

    return {
        connectionState,
        errorMessage,
        messages,
        startConversation,
        stopConversation,
    };
}
