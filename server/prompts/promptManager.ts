import { BASE_PROMPT } from "./basePrompt";
import { LESSON_PROMPTS, TOTAL_LESSONS } from "./lessonPrompts";
import { 
  LESSON_1_MASTER_PROMPT, 
  LESSON_1_STEPS, 
  LESSON_1_STEP_ORDER,
  getNextStep,
  getLesson1StepPrompt,
  type Lesson1Step 
} from "./lesson1Steps";

export function getBasePrompt(): string {
  return BASE_PROMPT;
}

export function getLessonPrompt(lessonNumber: number): string {
  const validLesson = Math.max(1, Math.min(lessonNumber, TOTAL_LESSONS));
  if (validLesson === 1) {
    return "";
  }
  return LESSON_PROMPTS[validLesson] || LESSON_PROMPTS[2];
}

export function getSystemPrompt(lessonNumber: number): string {
  return getBasePrompt() + "\n\n" + getLessonPrompt(lessonNumber);
}

export function validateLesson(lessonNumber: number): boolean {
  return lessonNumber >= 1 && lessonNumber <= TOTAL_LESSONS;
}

export function getLesson1MasterPrompt(): string {
  return LESSON_1_MASTER_PROMPT;
}

export function getLesson1Step(step: Lesson1Step): string {
  return getLesson1StepPrompt(step);
}

export function getLesson1NextStep(current: Lesson1Step): Lesson1Step {
  return getNextStep(current);
}

export { TOTAL_LESSONS, LESSON_1_STEP_ORDER };
export type { Lesson1Step };
