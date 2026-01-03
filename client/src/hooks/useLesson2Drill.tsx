import { useState, useRef, useCallback } from "react";
// Recuperamos el array rígido
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";
import { aiApi } from "../lib/api";

type ConnectionState = "idle" | "connecting" | "active" | "ended" | "error";

export interface ConversationMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
}

// Helper interno de TTS
async function speakWithTTS(text: string) {
    if (!text) return;
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

    // Refs de WebRTC y Audio
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    // Refs de Estado Lógico
    const messagesRef = useRef<ConversationMessage[]>([]);
    const currentQuestionIndexRef = useRef<number>(0); // Volvemos a usar el índice
    const isProcessingRef = useRef<boolean>(false);
    const isTTSSpeakingRef = useRef<boolean>(false);
    const sessionIdRef = useRef<string | null>(null);

    // Helper para mantener estado y ref sincronizados
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

        addMessage("assistant", text); // Visualmente lo agregamos al chat
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
            currentQuestionIndexRef.current = 0; // Reset índice

            const tokenRes = await fetch(
                `/api/assistant/simple-session?lesson=2&part=${part}`,
            );
            const response = await tokenRes.json();
            sessionIdRef.current = response.sessionId;

            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            // Audio Muteado (Solo canal de entrada)
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
                console.log("✅ [L2] Drill Rígido + Pipeline Iniciado");
                setConnectionState("active");

                // Configuración pasiva para transcripción
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

                // 1. ARRANCAR CON LA PRIMERA PREGUNTA DEL ARRAY
                const firstQ = LESSON_2_VOICE_MVP_QUESTIONS[0];
                if (firstQ) {
                    setTimeout(() => speakText(firstQ), 500);
                }
            };

            dc.onmessage = async (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (e) {
                    return;
                }

                if (
                    data.type === "input_audio_buffer.speech_stopped" ||
                    data.type === "response.created"
                ) {
                    dc.send(JSON.stringify({ type: "response.cancel" }));
                }

                if (
                    data.type ===
                    "conversation.item.input_audio_transcription.completed"
                ) {
                    const userText = data.transcript.trim();

                    // Lógica anti-eco y validación
                    if (
                        !userText ||
                        isTTSSpeakingRef.current ||
                        isProcessingRef.current
                    )
                        return;

                    // Filtro simple para no auto-escucharse (si lee la pregunta)
                    const currentQ =
                        LESSON_2_VOICE_MVP_QUESTIONS[
                            currentQuestionIndexRef.current
                        ];
                    if (
                        currentQ &&
                        userText
                            .toLowerCase()
                            .includes(currentQ.toLowerCase().substring(0, 10))
                    ) {
                        return;
                    }

                    console.log(`👤 [User Answer] ${userText}`);
                    isProcessingRef.current = true;
                    addMessage("user", userText);

                    try {
                        // 2. CONSULTAR AL PIPELINE (FEEDBACK)
                        // Le mandamos contexto de qué pregunta se está respondiendo para que valide mejor
                        const feedbackPrompt = `El usuario está respondiendo a este ejercicio: "${currentQ}". Su respuesta fue: "${userText}". Dame un feedback muy breve (1 frase) o confirma si está bien.`;

                        const aiResponse = await aiApi.chatPipeline({
                            message: feedbackPrompt,
                            // Opcional: si tu pipeline ignora el prompt y solo usa 'message' como chat,
                            // enviamos userText directo. Pero lo ideal es contextualizar.
                            history: messagesRef.current,
                        });

                        const feedbackText =
                            aiResponse.data || aiResponse.message || aiResponse;

                        // 3. DECIR FEEDBACK
                        if (feedbackText) {
                            await speakText(feedbackText);
                        }

                        // 4. AVANZAR A LA SIGUIENTE PREGUNTA RÍGIDA
                        const nextIdx = currentQuestionIndexRef.current + 1;
                        if (nextIdx < LESSON_2_VOICE_MVP_QUESTIONS.length) {
                            currentQuestionIndexRef.current = nextIdx;
                            const nextQ = LESSON_2_VOICE_MVP_QUESTIONS[nextIdx];
                            // Pequeña pausa natural entre feedback y nueva pregunta
                            setTimeout(() => speakText(nextQ), 500);
                        } else {
                            await speakText(
                                "¡Excelente! Hemos terminado el ejercicio.",
                            );
                            stopConversation();
                        }
                    } catch (error) {
                        console.error("Pipeline Error:", error);
                        // Si falla la IA, avanzamos igual para no trabar al usuario
                        const nextIdx = currentQuestionIndexRef.current + 1;
                        if (nextIdx < LESSON_2_VOICE_MVP_QUESTIONS.length) {
                            currentQuestionIndexRef.current = nextIdx;
                            speakText(LESSON_2_VOICE_MVP_QUESTIONS[nextIdx]);
                        }
                    } finally {
                        isProcessingRef.current = false;
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

    return {
        connectionState,
        errorMessage,
        messages,
        startConversation,
        stopConversation,
    };
}
