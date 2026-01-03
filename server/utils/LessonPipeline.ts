import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface LessonStep {
  index: number;
  internalGoal: string;
  aiInstruction: string;
  expectedUserIntent: string;
}

export interface UserProgress {
  currentStepIndex: number;
  failedAttempts: number;
  isLessonComplete: boolean;
}

export interface PipelineInput {
  userText: string;
  history: any[];
  currentStep: LessonStep;
  nextStep?: LessonStep;
  userProgress: UserProgress;
}

export interface PipelineOutput {
  aiResponse: string;
  updatedProgress: UserProgress;
  feedback?: string;
  isValid: boolean;
}

async function validateUserResponse(
  userText: string,
  step: LessonStep,
): Promise<{ passed: boolean; reason: string }> {
  const systemPrompt = `
    You are a strict language evaluator.
    Current Goal: The user must express the intent "${step.expectedUserIntent}" related to "${step.internalGoal}".
    User Input: "${userText}"

    Return a JSON object with:
    - passed: boolean (true if the intent is clear and correct)
    - reason: string (very brief explanation of why it passed or failed)
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  return JSON.parse(
    response.choices[0].message.content ||
      '{"passed": false, "reason": "Error parsing"}',
  );
}

async function generateCharacterResponse(
  instruction: string,
  history: any[],
  context: string,
): Promise<string> {
  const systemPrompt = `
    You are a roleplay character in a language lesson.
    Context: ${context}
    Current Instruction: ${instruction}
    Keep the response concise, natural, and strictly following the instruction.
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }, ...history.slice(-3)],
    temperature: 0.7,
  });

  return response.choices[0].message.content || "";
}

export async function runLessonPipeline(
  input: PipelineInput,
): Promise<PipelineOutput> {
  const { userText, currentStep, nextStep, userProgress, history } = input;

  const validation = await validateUserResponse(userText, currentStep);

  if (validation.passed) {
    if (!nextStep) {
      return {
        aiResponse: "Congratulations! You have completed the lesson perfectly.",
        updatedProgress: { ...userProgress, isLessonComplete: true },
        isValid: true,
      };
    }

    const aiResponse = await generateCharacterResponse(
      nextStep.aiInstruction,
      history,
      "The user answered correctly. Move to the next topic.",
    );

    return {
      aiResponse,
      updatedProgress: {
        ...userProgress,
        currentStepIndex: nextStep.index,
        failedAttempts: 0,
      },
      isValid: true,
    };
  } else {
    const correctionInstruction = `The user failed to ${currentStep.internalGoal}. Reason: ${validation.reason}. Kindly explain the mistake briefly and repeat the question: ${currentStep.aiInstruction}`;

    const aiResponse = await generateCharacterResponse(
      correctionInstruction,
      history,
      "The user made a mistake. Be helpful but persistent.",
    );

    return {
      aiResponse,
      updatedProgress: {
        ...userProgress,
        failedAttempts: userProgress.failedAttempts + 1,
      },
      feedback: validation.reason,
      isValid: false,
    };
  }
}
