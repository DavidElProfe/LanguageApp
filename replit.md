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
- **Simple Mode (MVP)**: Voice conversation mode using the ChatPartner component at `/` route. Uses a single self-contained prompt (`server/prompts/simpleConversationPrompt.ts`) with 52 ordered questions. Features explicit backend question flow control with:
  - Questions in English, corrections in Spanish
  - Backend tracks `currentQuestionIndex` per session in memory (`simpleSessionStates` Map)
  - Questions extracted to `server/prompts/simpleConversationQuestions.ts` for index-based access
  - Silent orientation context injected into prompt (AI knows its position without mentioning numbers)
  - Question advancement detected by comparing AI output with expected next question
  - Automatic recap at the end with feedback in Spanish
  - Endpoint: `/api/assistant/simple-session` (accepts `?initialQuestionIndex=N` for testing)
  - Process response: `POST /api/assistant/simple-session/:sessionId/process-response`
  - Validate response: `POST /api/assistant/simple-session/:sessionId/validate-response`
  - State query: `GET /api/assistant/simple-session/:sessionId/state`
  - Hook: `useSimpleConversation.ts`
  - Session cleanup: Expired sessions (>2 hours) are automatically cleaned up
  - **Language Guardrail (P25-P32)**: Backend enforces Spanish-only responses for "What does X mean?" questions. English answers (employee, office, paper, etc.) are rejected with correction instruction. Uses positive matching against known English translations.
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