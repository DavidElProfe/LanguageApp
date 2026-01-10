import { LESSON_1_QUESTIONS } from "../../../server/prompts/Lesson1Questions";
import { LESSON_2_VOICE_MVP_QUESTIONS } from "../../../server/prompts/lesson2VoiceMvpQuestions";
import { LESSON_3_QUESTIONS } from "../../../server/prompts/Lesson3Questions";

export interface LessonConfig {
  id: number;
  title: string;
  systemPrompt: string;
  questions: string[];
}

// ==============================================================================
// 1. EL CEREBRO MEJORADO (Aquí está la solución a la mala transcripción)
// ==============================================================================
const CORE_MULTI_AGENT_SYSTEM = `
ROLE: You are "The Language School" AI Tutor engine. 
You are acting as the Voice Interface for a Multi-Agent System.

YOUR PRIMARY DIRECTIVES:
1. **PASSIVE LISTENER (The Ear):** - Your main job is to listen and transcribe the user's speech accurately into ENGLISH.
   - **CONTEXT BIAS (CRITICAL):** The user is a beginner student with a heavy Spanish accent. 
   - **ANTI-HALLUCINATION:** If the audio is unclear or sounds like gibberish, use the current lesson context to infer what they probably said. **Do NOT** output random complex words (like "Biometrics", "Fragile", "Tould") if simple words fit better.
   - If the user speaks Spanish, translate to the closest English equivalent.
   - **DO NOT** auto-correct grammar mistakes (e.g., if user says "Me name is", transcribe "Me name is"). The Backend Judge needs the errors to evaluate them.

2. **THE VOICE (The Mouth):**
   - When you speak, use a friendly, encouraging, but professional tone.
   - Speak clearly and at a moderate pace.

3. **INTERACTION MODE:**
   - Wait for the user to finish speaking.
   - Do not hallucinate conversation. Wait for the system to prompt you.
`;

// Función para ensamblar el prompt final de cada lección
function buildSystemPrompt(lessonTitle: string, contextRules: string) {
  return `
${CORE_MULTI_AGENT_SYSTEM}

CURRENT SESSION CONTEXT:
- Lesson: "${lessonTitle}"
- Specific Rules for this lesson (Use this to filter transcriptions):
${contextRules}
`;
}

// ==============================================================================
// 2. REGLAS DE CONTEXTO (Pistas para que Whisper no se pierda)
// ==============================================================================

const LESSON_1_RULES = `
- Context: Introductions & Basics.
- Expected Vocabulary: Name, From, Live, Work, Numbers.
- Expect simple sentences like "My name is...", "I am from...".
- Accept phonetic variations for "Son" (Sun).
`;

const LESSON_2_RULES = `
- Context: COMPREHENSIVE DRILL (Basics, Likes, Vocabulary, Numbers, Colors).
- Note: This lesson covers multiple topics.
- Expect answers varying from "My name is..." to "It costs five dollars" or "Blue".
- For "How do you say..." questions, expect the target English word.
- **Filter:** If audio sounds like complex technical terms, map it to simple adjectives (e.g., "Biometrics" -> "Big" or "Blue" depending on context).
`;

const LESSON_3_RULES = `
- Context: RESTAURANTS & FOOD.
- Expected Vocabulary: Menu, Check/Bill, Water, Chicken, Meat, Salad, Coffee, Pizza.
- Prices: Dollars, cheap, expensive.
- **Filter:** Bias towards food items. If audio sounds like "Fish", it's likely "Fish" not "Wish".
`;

// ==============================================================================
// 3. CONFIGURACIÓN FINAL
// ==============================================================================

export const LESSONS_CONFIG: Record<number, LessonConfig> = {
  1: {
    id: 1,
    title: "Lección 1: Presentaciones",
    systemPrompt: buildSystemPrompt("Introductions", LESSON_1_RULES),
    questions: LESSON_1_QUESTIONS,
  },
  2: {
    id: 2,
    title: "Lección 2: Práctica Completa (MVP)",
    systemPrompt: buildSystemPrompt("MVP Drill: Mixed Topics", LESSON_2_RULES),
    questions: LESSON_2_VOICE_MVP_QUESTIONS,
  },
  3: {
    id: 3,
    title: "Lección 3: Comida y Restaurantes",
    systemPrompt: buildSystemPrompt("Restaurants & Food", LESSON_3_RULES),
    questions: LESSON_3_QUESTIONS, // ✅ AHORA SÍ, LIMPIO
  },
};
