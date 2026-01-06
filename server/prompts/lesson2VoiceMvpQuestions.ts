// 1. INTRO & BASICS (Calentamiento)
const SECTION_1_BASICS = [
  "What is your name?",
  "Where are you from?",
  "Where do you live?",
  "Where do you work?",
  "What is your telephone number?",
];

// 2. LIKES & DISLIKES (Filtramos las 30 originales a las 5 más comunes)
const SECTION_2_LIKES = [
  "What do you like?",
  "Do you like to go to the movies?",
  "Do you like to listen to music?",
  "Do you like coffee?",
  "Do you like to play sports?",
];

// 3. VOCABULARY DRILL (Mezcla de Personas y Objetos - Solo lo esencial)
const SECTION_3_VOCAB = [
  "How do you say el hermano in English?",
  "How do you say la madre in English?",
  "How do you say el hijo in English?",
  "How do you say el maestro in English?",
  "How do you say el libro in English?",
  "How do you say la pizarra in English?",
  "How do you say la mochila in English?",
];

// 4. NUMBERS & PRICES (Práctica de fluidez numérica)
const SECTION_4_NUMBERS = [
  "How many books are there?",
  "How many pens are there?",
  "How much does a cheeseburger cost?",
  "How much does a pizza cost?",
  "How much does a t-shirt cost?",
];

// 5. COLORS (Visualización rápida)
const SECTION_5_COLORS = [
  "What color is the pencil?",
  "What color is the door?",
  "What color is the book?",
  "What color is the dog?",
];

// 6. SMALL TALK & CLOSING (Para terminar con buena energía)
const SECTION_6_CLOSING = [
  "Do you like pizza?",
  "Do you like the beach?",
  "What is your favorite food?",
  "What is your favorite movie genre?",
  "What is your favorite weather?",
];

export const LESSON_2_VOICE_MVP_QUESTIONS = [
  ...SECTION_1_BASICS,
  ...SECTION_2_LIKES,
  ...SECTION_3_VOCAB,
  ...SECTION_4_NUMBERS,
  ...SECTION_5_COLORS,
  ...SECTION_6_CLOSING,
];
