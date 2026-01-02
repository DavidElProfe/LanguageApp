# La Escuela de Idiomas - "¡Empecemos a hablar!"

## Overview
"La Escuela de Idiomas" is a production-ready, Spanish-only language learning platform designed to facilitate language acquisition through structured content and interactive activities. Its core purpose is to provide an engaging and effective learning experience, leveraging embedded external resources and a clear, hierarchical content model. The platform supports a freemium model with a focus on user progress tracking and a streamlined, intuitive user interface. The project aims to become a leading platform for Spanish speakers to learn new languages, starting with English.

## User Preferences
- **Design System**: Material Design-inspired with warm, encouraging aesthetics
- **Color Palette**: Primary (orange/amber), accent (teal/cyan), warm neutrals
- **Typography**: Clear hierarchy with readable fonts
- **Components**: shadcn/ui with custom theming
- **Interactions**: Smooth transitions, hover states, active states
- **Responsiveness**: Mobile-first, works on all screen sizes

## System Architecture
The application uses a **hybrid database architecture**.

### UI/UX Decisions
The UI is exclusively in Spanish, with a dark mode option and theme persistence. It features a clean, responsive design based on shadcn/ui components with custom theming, adhering to a Material Design-inspired aesthetic with a warm color palette.

### Technical Implementations
- **Frontend**: React 18 (TypeScript, Tailwind CSS, shadcn/ui, Wouter, TanStack Query)
- **Backend**: Express.js (Drizzle ORM)
- **Authentication**: Supabase Auth (email/password, Google OAuth, password reset)
- **Database**: Replit PostgreSQL (all application data - courses, lessons, activities, progress)
- **OOP Content Hierarchy**: A robust, object-oriented content model (`Course` → `Lesson` → `Topic` → `Activity`) is implemented using TypeScript classes.
- **Activity Types**: Supports `VideoActivity` (embedded YouTube), `QuizletActivity` (embedded Quizlet flashcards), and `AIChatActivity` (conversational practice with OpenAI Realtime API).
- **Progress Tracking**: Activity completion is tracked, enabling streak counters and overall progress percentages. Smart topic navigation ensures users resume learning at their exact previous position.
- **Localization**: Full Spanish localization for all UI elements and content.
- **Database Seeding**: An `/api/admin/seed` endpoint allows for one-click production database seeding with sample Spanish content.
- **Direct-to-Video Registration Flow**: New users are directed to the first video lesson immediately after registration.
- **Smart Resume & Back Navigation**: Intelligent navigation for new and returning users, resuming learning at the precise next activity.
- **Simplified Progressive Learning Flow**: Streamlined UI with a clear progression (Video → Flashcards → AI Chat → Next Topic Video).
- **AI Voice Conversation Feature**: Real-time WebRTC voice practice using OpenAI Realtime API, including ephemeral session tokens, full-duplex audio communication, and persistent live text transcripts. Session usage time is tracked in the `ai_sessions` table (started_at, ended_at). This is the **default landing page** when users visit the website or log in. Also available as Activity Type 3 (topic-based) within the learning flow.
- **AI Text Chat Feature**: Text-based alternative to voice chat using OpenAI Chat Completions API (gpt-4o). Uses the exact same lesson-based prompt system as voice chat. Available at `/text-chat` route. Useful for testing without audio or in public places.
- **Simple Mode (MVP)**: Voice conversation mode using the ChatPartner component at `/` route. Supports multiple lessons with explicit backend question flow control:
  - **Lesson 1**: Uses `simpleConversationPrompt.ts` with 52 ordered questions
    - Backend tracks `currentQuestionIndex` per session in `simpleSessionStates` Map
    - Endpoint: `/api/assistant/simple-session?lesson=1&initialQuestionIndex=N`
  - **Lesson 2**: Uses `simpleConversationPrompt2.ts` with 8 PARTS containing 160+ questions
    - Part 1: Making Friends (37 questions)
    - Part 2: Vocabulary - People (30 questions)
    - Part 3: Vocabulary - Classroom Objects (20 questions)
    - Part 4: Role Play - Shopping (12 scripted lines)
    - Part 5: Relevance/Personalization (4 questions)
    - Part 6: Practicing Numbers (21 questions)
    - Part 7: Practicing Colors (12 questions)
    - Part 8: Making Small Talk (24 questions)
    - Backend tracks `currentPart` and `currentQuestionInPart` per session in `lesson2SessionStates` Map
    - **Automatic PART advancement**: Questions advance automatically within each PART, then auto-advance to next PART
    - Questions defined in `server/prompts/lesson2Questions.ts` with helper functions
    - Endpoint: `/api/assistant/simple-session?lesson=2&part=N&question=N` (part/question for testing)
    - Advance endpoint: `POST /api/assistant/lesson2-session/:sessionId/advance`
    - State query: `GET /api/assistant/lesson2-session/:sessionId/state`
  - Questions in English, corrections in Spanish
  - Silent orientation context injected into prompt (AI knows its position without mentioning numbers)
  - Hook: `useRealtimeConversation.ts` (passes lesson and part parameters)
  - Session cleanup: Expired sessions (>2 hours) are automatically cleaned up
- **Multi-Agent AI Architecture** (Experimental): Modular multi-agent system in `server/agents/` and `server/orchestrator/` with:
  - `Orchestrator`: Central decision-maker that coordinates all agents
  - `ValidationAgent`: Validates user input for correctness and safety
  - `ConversationAgent`: Generates domain-specific conversational responses
  - `PedagogyAgent`: Explains language concepts and mistakes
  - `ControlAgent`: Enforces system rules and constraints
  - Externalized prompts in `server/agents/prompts/`
  - All agents communicate only through the Orchestrator
  - Designed for isolation and reversibility (experimental branch work)
- **Lesson-Based Prompt System**: Unified modular prompt architecture in `server/prompts/` with:
  - `basePrompt.ts`: Short generic base prompt (tutor role, language rules, turn-taking)
  - `lessonPrompts.ts`: 10 lesson-specific prompts (lessons 2-10) with allowed vocabulary and restrictions
  - `lesson1Steps.ts`: **Step-based prompts for Lesson 1** with client-controlled state machine:
    - `LESSON_1_MASTER_PROMPT`: Global rules for Lesson 1 (no question flow)
    - 5 step prompts: `NAME`, `FROM`, `LIVE`, `WORK`, `LIKE`, `DONE`
    - Each step contains exact question, valid/invalid/incorrect behavior
    - Client advances steps after correct answers
  - `promptManager.ts`: Exports functions for all prompt types
  - Temperature set to 0.3 for strict instruction following
  - Endpoint accepts `?lesson=N` parameter (1-10), defaults to lesson 1
- **Authentication-Gated Content**: All course content requires account creation, with unauthenticated users redirected to `/auth`.
- **Step-by-Step Visual Prompts**: `ActivitySteps` component shows clear progression through each topic with visual indicators.
- **Progress Bar & Next Topic Navigation**: Real-time progress bar and "Continuar" button to guide users through topics and lessons.

### Feature Specifications
- **Course System**: Hierarchical content organization for clear learning paths.
- **User Dashboard**: Displays personalized learning statistics including streaks and progress.
- **Admin Panel**: Provides real SQL-based analytics.
- **Spanish-Only UI**: All interface and content are presented in Spanish.
- **Activity Ordering**: Activities are consistently ordered (Video → Quizlet → AI Chat) for optimal learning flow.

### System Design Choices
- **Type-safe Development**: `shared/schema.ts` ensures consistency between frontend and backend.
- **Hierarchical Data Loading**: The backend efficiently loads complete course hierarchies.
- **State Management**: TanStack Query manages data fetching and cache invalidation.
- **Environment Configuration**: Utilizes Replit Secrets for secure storage of API keys and database credentials.

## External Dependencies
- **Supabase**:
    - Authentication (Email/Password, Google OAuth)
- **Replit PostgreSQL**:
    - All application data (courses, lessons, activities, user progress)
- **YouTube**:
    - Embedded video lessons within `VideoActivity` components
- **Quizlet**:
    - Embedded flashcard sets within `QuizletActivity` components
- **OpenAI**:
    - Realtime API for AI Voice Conversation (Assistant asst_uoHk8D6G4ZPtYrb6lwueR0uh)
    - Text-to-Speech API (POC for deterministic voice output)

## TTS Proof-of-Concept (Experimental)
A minimal, isolated Text-to-Speech implementation has been added to experiment with deterministic voice output as an alternative to Realtime Voice (which may improvise). This does NOT replace or modify the existing Realtime Voice logic.

### TTS Architecture
- **Server Helper**: `server/utils/ttsHelper.ts` - Core TTS functions using OpenAI's `gpt-4o-mini-tts` model
- **API Routes**: `server/ttsRoutes.ts` - REST endpoints for TTS generation
- **Client Hook**: `client/src/hooks/useTTSPlayer.ts` - React hook for playing TTS audio

### TTS API Endpoints
- `POST /api/tts/speak` - Generate speech from any text
  - Body: `{ text: string, voice?: string, speed?: number }`
  - Returns: MP3 audio buffer
- `GET /api/tts/speak-stream` - Stream speech audio
  - Query params: `text`, `voice`, `speed`
- `GET /api/tts/lesson-question/:index` - Speak a specific lesson question by index
  - Returns: MP3 audio with X-Question-Text header
- `GET /api/tts/questions-list` - List all available lesson questions

### TTS Voices Available
alloy, echo, fable, onyx, nova (default), shimmer, coral, sage

### Usage Example (Client)
```typescript
import { useTTSPlayer } from "@/hooks/useTTSPlayer";

const { speak, speakLessonQuestion, isPlaying, stop } = useTTSPlayer();

// Speak custom text
await speak("Hello, how are you?", { voice: "nova", speed: 1.0 });

// Speak a lesson question by index
await speakLessonQuestion(0); // "What is your name?"
```

### Toggle TTS vs Realtime
This TTS implementation is designed to be used alongside or as a replacement for `forceAISpeech` in `useRealtimeConversation.ts`. To toggle:
1. Import `useTTSPlayer` hook
2. Replace `forceAISpeech(text)` calls with `speak(text)` calls
3. The lesson logic, validation, and state machine remain unchanged

## Lesson 2 Hybrid Mode (Active)
Lesson 2 now uses a hybrid approach:
- **Voice Output**: Deterministic TTS speaks EXACT scripted questions from `LESSON_2_VOICE_MVP_QUESTIONS`
- **Voice Input**: Realtime API still handles speech-to-text transcription
- **Realtime Audio**: Muted for Lesson 2 to ensure only TTS speaks

### How It Works
1. When Lesson 2 starts, TTS speaks the first scripted question
2. User responds via voice → Realtime transcribes the speech
3. Hook logic advances to next question
4. TTS speaks the next exact scripted question
5. Process repeats until all 33 questions are complete
6. Lesson ends with "Take care!" (last scripted line)

### Key Differences from Lesson 1
- Lesson 1: Realtime handles both input AND output (may improvise)
- Lesson 2: Realtime handles input only, TTS handles output (100% deterministic)

This is a proof-of-concept to validate control and determinism before wider adoption.