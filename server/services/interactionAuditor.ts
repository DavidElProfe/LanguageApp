import * as fs from "fs";
import * as path from "path";
import type { 
  VerifierAgentOutput, 
  GrammarAgentOutput, 
  JudgeAgentOutput 
} from "../agents/types/analysisTypes";

// Definimos la ruta del archivo: "audit_logs.txt" en la raíz del proyecto
// process.cwd() obtiene la carpeta donde se ejecuta el servidor
const LOG_FILE_PATH = path.join(process.cwd(), "audit_logs.txt");

export async function auditInteraction(
  sessionId: string,
  lessonId: number,
  transcription: string,
  verifier: VerifierAgentOutput,
  grammar: GrammarAgentOutput,
  judge: JudgeAgentOutput 
) {
  const tags: string[] = [];

  // --- LÓGICA DE DETECCIÓN DE ANOMALÍAS ---

  // 1. Alucinación de Whisper (Texto repetitivo o muy largo)
  if (/(.)\1{4,}/.test(transcription) || transcription.length > 250) {
    tags.push("TRANSCRIPTION_SUSPECT");
  }

  // 2. Contradicción de Agentes (Verifier dice NO, Judge dice SÍ)
  // Usamos 'relevanceScore' y 'decision'
  if (verifier.relevanceScore < 40 && judge.decision === "advance") {
    tags.push("AGENT_CONTRADICTION");
  }

  // 3. Problemas de Gramática (El usuario sufre)
  // Usamos 'overallAssessment' según tu archivo de tipos
  if (verifier.isRelevant && (grammar.overallAssessment === "needs_improvement" || grammar.hasErrors)) {
    tags.push("GRAMMAR_STRUGGLE");
  }

  // 4. Error del Usuario (Respuesta incorrecta lógica)
  if (!verifier.isRelevant && !tags.includes("TRANSCRIPTION_SUSPECT")) {
    tags.push("USER_MISTAKE");
  }

  // 5. Todo perfecto
  if (tags.length === 0 && judge.decision === "advance") {
    tags.push("PERFECT_MATCH");
  }

  // --- GENERACIÓN DEL REPORTE ---

  const timestamp = new Date().toLocaleString();
  
  // 1. Log en consola (Resumido para ver en vivo)
  const logEntry = {
    timestamp,
    sessionId,
    tags,
    input: transcription.substring(0, 50) + (transcription.length > 50 ? "..." : ""),
  };
  console.log("🕵️ [AUDITOR]", JSON.stringify(logEntry));

  // 2. Guardado en TXT
  // Solo guardamos si NO fue perfecto (para registrar fallos)
  // Si quieres guardar todo, simplemente borra el 'if'
  if (!tags.includes("PERFECT_MATCH")) {
    
    const fileContent = `
==================================================
[${timestamp}] SESSION: ${sessionId} (L${lessonId})
TAGS: [${tags.join(", ")}]
--------------------------------------------------
🗣️ INPUT: "${transcription}"
📊 SCORES:
   - Verifier Score: ${verifier.relevanceScore}/100
   - Grammar Check: ${grammar.overallAssessment}
   - Judge Decision: ${judge.decision}
==================================================
`;

    // --- LOGS DE DEPURACIÓN (Para verificar que funciona) ---
    console.log(`📝 [DEBUG] Intentando escribir reporte en: ${LOG_FILE_PATH}`);

    // Escribe al final del archivo sin borrar lo anterior
    fs.appendFile(LOG_FILE_PATH, fileContent, (err) => {
      if (err) {
        console.error("⚠️ [ERROR] No se pudo escribir en audit_logs.txt:", err);
      } else {
        console.log("✅ [DEBUG] Reporte guardado exitosamente en el archivo.");
      }
    });
  }
}