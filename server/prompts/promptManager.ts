import { BASE_PROMPT } from "./basePrompt";
import { LESSON_PROMPTS, TOTAL_LESSONS } from "./lessonPrompts";

export function getSystemPrompt(lessonNumber: number): string {
  const validLesson = Math.max(1, Math.min(lessonNumber, TOTAL_LESSONS));
  
  const lessonPrompt = LESSON_PROMPTS[validLesson];
  
  if (!lessonPrompt) {
    console.error(`Lesson ${lessonNumber} not found, defaulting to lesson 1`);
    return BASE_PROMPT + "\n\n" + LESSON_PROMPTS[1];
  }
  
  return BASE_PROMPT + "\n\n" + lessonPrompt;
}

export function validateLesson(lessonNumber: number): boolean {
  return lessonNumber >= 1 && lessonNumber <= TOTAL_LESSONS;
}

export { TOTAL_LESSONS };
