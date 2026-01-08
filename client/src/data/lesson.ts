import { LESSON_1_QUESTIONS } from "../../../server/prompts/Lesson1Questions";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";

export interface LessonConfig {
  id: number;
  title: string;
  systemPrompt: string; // El "instructions" de OpenAI
  questions: string[]; // Array de preguntas para referencia
}

// DEFINICIÓN DE PROMPTS (Lo que antes estaba hardcodeado en los hooks)
const PROMPT_LESSON_1 = `
System: You are an English transcriber and strict tutor.
Context: Lesson 1 - Intro & Basics.
Rules:
1. Strict English transcription (No auto-correcting "Me name").
2. Accept "Sun" for "Son" phonetically.
3. Require full sentences for "What is..." questions.
`;

const PROMPT_LESSON_2 = `
System: You are a passive transcriber/tutor.
Context: Lesson 2 - Likes & Descriptions.
Rules:
1. Focus on "Do you like..." structures.
2. Require full sentences ("Yes, I like...").
`;

export const LESSONS_CONFIG: Record<number, LessonConfig> = {
  1: {
    id: 1,
    title: "Lección 1: Presentaciones",
    systemPrompt: PROMPT_LESSON_1,
    questions: LESSON_1_QUESTIONS,
  },
  2: {
    id: 2,
    title: "Lección 2: Gustos y Preferencias",
    systemPrompt: PROMPT_LESSON_2,
    questions: LESSON_2_VOICE_MVP_QUESTIONS,
  },
};
