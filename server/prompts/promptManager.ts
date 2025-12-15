import { BASE_PROMPT } from "./basePrompt";
import { LESSON_PROMPTS, TOTAL_LESSONS } from "./lessonPrompts";

export function getBasePrompt(): string {
  return BASE_PROMPT;
}

export function getLessonPrompt(lessonNumber: number): string {
  const validLesson = Math.max(1, Math.min(lessonNumber, TOTAL_LESSONS));
  return LESSON_PROMPTS[validLesson] || LESSON_PROMPTS[1];
}

export function getSystemPrompt(lessonNumber: number): string {
  return getBasePrompt() + "\n\n" + getLessonPrompt(lessonNumber);
}

export function validateLesson(lessonNumber: number): boolean {
  return lessonNumber >= 1 && lessonNumber <= TOTAL_LESSONS;
}

export { TOTAL_LESSONS };
