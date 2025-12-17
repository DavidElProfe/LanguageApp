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

// Indices for "What does X mean?" questions (1-based)
const WHAT_DOES_QUESTION_START = 25;
const WHAT_DOES_QUESTION_END = 32;

export function getQuestionByIndex(index: number): string | null {
  if (index < 1 || index > TOTAL_QUESTIONS) {
    return null;
  }
  return SIMPLE_CONVERSATION_QUESTIONS[index - 1];
}

/**
 * Check if the current question index is a "What does X mean?" question
 * These questions require Spanish responses
 */
export function isWhatDoesQuestion(questionIndex: number): boolean {
  return questionIndex >= WHAT_DOES_QUESTION_START && questionIndex <= WHAT_DOES_QUESTION_END;
}

/**
 * Known English translations that should be rejected for "What does X mean?" questions
 * These are the exact English words the student might incorrectly use instead of Spanish
 */
const KNOWN_ENGLISH_TRANSLATIONS = [
  // Direct translations for P25-P32 questions
  'computer', 'computers',
  'office', 'offices', 
  'paper', 'papers',
  'employee', 'employees',
  'director', 'directors',
  'student', 'students',
  'conference room', 'conference rooms', 'meeting room', 'meeting rooms',
  'classroom', 'classrooms', 'class room', 'class rooms',
  // Common English-only responses
  'it means', 'means', 'the', 'a', 'an',
];

/**
 * Detect if a response is an English translation that should be rejected
 * Uses POSITIVE matching against known English words, not negative heuristics
 * 
 * Returns true ONLY if the response matches a known English translation
 */
export function looksLikeEnglish(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  
  // Empty or too short to determine
  if (trimmed.length < 2) {
    return false;
  }
  
  // If text contains Spanish-specific characters, definitely NOT English
  const spanishChars = /[áéíóúñüÁÉÍÓÚÑÜ¿¡]/;
  if (spanishChars.test(trimmed)) {
    return false;
  }
  
  // Clean punctuation for matching
  const cleaned = trimmed.replace(/[.,!?'"]/g, '').trim();
  
  // Check if the response IS a known English translation
  for (const englishWord of KNOWN_ENGLISH_TRANSLATIONS) {
    // Exact match
    if (cleaned === englishWord) {
      return true;
    }
    // Response starts with or ends with the English word (e.g., "it's employee")
    if (cleaned.startsWith(englishWord + ' ') || cleaned.endsWith(' ' + englishWord)) {
      return true;
    }
    // Response is just the English word with articles (e.g., "the employee", "an office")
    if (cleaned === 'the ' + englishWord || cleaned === 'a ' + englishWord || cleaned === 'an ' + englishWord) {
      return true;
    }
  }
  
  return false;
}

export function findQuestionIndex(text: string): number | null {
  const normalizedText = text.toLowerCase().trim();
  
  for (let i = 0; i < SIMPLE_CONVERSATION_QUESTIONS.length; i++) {
    const question = SIMPLE_CONVERSATION_QUESTIONS[i].toLowerCase();
    const questionCore = question.replace(/[?.!,]/g, '').trim();
    const textCore = normalizedText.replace(/[?.!,]/g, '').trim();
    
    if (textCore.includes(questionCore) || questionCore.includes(textCore)) {
      return i + 1;
    }
    
    const questionWords = questionCore.split(' ').filter(w => w.length > 3);
    const matchingWords = questionWords.filter(word => textCore.includes(word));
    if (matchingWords.length >= Math.min(3, questionWords.length * 0.6)) {
      return i + 1;
    }
  }
  
  return null;
}
