import OpenAI from "openai";

// Verificación básica de seguridad
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY is missing. AI features will fail.");
}

// Exportamos la instancia única para usarla en toda la app
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
