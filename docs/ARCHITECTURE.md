# 🏗️ Arquitectura del Sistema - The Language School

Este documento describe la arquitectura técnica de la plataforma de aprendizaje de idiomas con IA.

## 🔄 Flujo de Datos Híbrido

El sistema utiliza una arquitectura híbrida para optimizar costos y latencia:

1.  **Módulo de Voz (Realtime):**
    * **Protocolo:** WebSockets (vía OpenAI Realtime API).
    * **Uso:** Conversación fluida instante a instante durante la lección.
    * **Ventaja:** Latencia ultra-baja (<500ms), interrupciones naturales.

2.  **Módulo de Análisis (REST):**
    * **Protocolo:** HTTP POST (vía OpenAI GPT-4o-mini).
    * **Uso:** Al finalizar la lección, se envían los errores recolectados.
    * **Ventaja:** Análisis profundo, feedback pedagógico y bajo costo.

## 🧩 Componentes Principales

### Frontend (React + Vite)
* **`useGenericDrill`:** Hook principal que gestiona el ciclo de vida de la lección.
* **`VoiceChat.tsx`:** Interfaz de usuario que maneja el micrófono y los estados visuales.
* **`aiApi`:** Capa de abstracción para comunicarse con el Backend.

### Backend (Node.js + Express)
* **`/api/ai/chat/pipeline`:** Endpoint para lógica de conversación estructurada.
* **`/api/ai/generate-summary`:** (NUEVO) Generador de feedback final usando GPT-4o-mini.
* **`seedDatabase.ts`:** Script de automatización para poblar el contenido de los cursos.

### Base de Datos (PostgreSQL + Drizzle)
* **`lessons`:** Contiene la estructura jerárquica del curso.
* **`activities`:** Almacena los `promptSets` específicos para cada ejercicio de IA.