export const SIMPLE_CONVERSATION_QUESTIONS: string[] = [
  `Hi, I'm your conversation partner from The Language School. What is your name?`,
  `It's nice to meet you. How are you?`,
  `I am from the United States. Where are you from?`,
  `I have been to Spain, Argentina, Chile, Ecuador, Cuba, the Dominican Republic, Mexico, Colombia, Uruguay, and Bolivia. Do you like to travel?`,
  `Where do you live?`,
  `I am an English teacher. Where do you work?`,
  `I like to cook. Do you like to cook?`,
  `I like to play drums. Do you like to play an instrument?`,
  `I like to ride bikes. Do you like to ride bikes?`,
  `I like to go to the gym. Do you like to go to the gym?`,
  `I like to practice yoga. Do you like to practice yoga?`,
  `I like to read. Do you like to read?`,
  `I like to watch movies. Do you like to watch movies?`,
  `I like to dance salsa. Do you like to dance?`,
  `Do you like to study?`,
  `Do you like American food?`,
  `Do you like Mexican food?`,
  `Do you like Italian food?`,
  `Do you like beer?`,
  `Do you like wine?`,
  `Do you like cocktails?`,
  `Do you like soccer?`,
  `Do you like football?`,
  `Do you like baseball?`,
  `What does computer mean in Spanish?`,
  `What does office mean?`,
  `What does paper mean?`,
  `What does employee mean?`,
  `What does director mean?`,
  `What does student mean?`,
  `What does conference room mean?`,
  `What does classroom mean?`,
  `How do you say computadora in English?`,
  `How do you say oficina?`,
  `How do you say papel?`,
  `How do you say empleado?`,
  `How do you say director?`,
  `How do you say estudiante?`,
  `How do you say salón de conferencia?`,
  `How do you say salón de clase?`,
  `How much does a piece of paper cost?`,
  `How much does a pen cost?`,
  `How much does a pencil cost?`,
  `How much does a marker cost?`,
  `How much does a package of paper cost?`,
  `How much does a box of pencils cost?`,
  `How much does a box of pens cost?`,
  `How much does a box of markers cost?`,
  `How much does an English book cost?`,
  `How much does a whiteboard cost?`,
  `What is your telephone number?`,
  `Let's stay in touch. Take care!`,
];

export const TOTAL_QUESTIONS = SIMPLE_CONVERSATION_QUESTIONS.length;

export function getQuestionByIndex(index: number): string | null {
  if (index < 1 || index > TOTAL_QUESTIONS) {
    return null;
  }
  return SIMPLE_CONVERSATION_QUESTIONS[index - 1];
}

export function findQuestionIndex(text: string): number | null {
  const normalizedText = text
    .toLowerCase()
    .replace(/[?.!,]/g, "")
    .trim();

  if (!normalizedText) return null;

  for (let i = 0; i < SIMPLE_CONVERSATION_QUESTIONS.length; i++) {
    const question = SIMPLE_CONVERSATION_QUESTIONS[i]
      .toLowerCase()
      .replace(/[?.!,]/g, "")
      .trim();

    if (
      normalizedText.includes(question) ||
      question.includes(normalizedText)
    ) {
      return i + 1;
    }

    const questionWords = question.split(" ").filter((w) => w.length > 3);
    const matchingWords = questionWords.filter((word) =>
      normalizedText.includes(word),
    );

    if (
      questionWords.length > 0 &&
      matchingWords.length >= Math.ceil(questionWords.length * 0.7)
    ) {
      return i + 1;
    }
  }

  return null;
}
