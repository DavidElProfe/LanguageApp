Jajaja, suele pasar, te emocionas escribiendo y te sale el idioma nativo. 😅

Aquí tienes el archivo **`docs/SCALABILITY_GUIDE.md`** completamente traducido al **Inglés Técnico Profesional**. Está listo para copiar y pegar.

```markdown
# 🚀 Scalability & Content Management Guide

**Project:** The Language School - AI Voice Architecture  
**Document Version:** 1.0

---

## 📖 Introduction

This document details the process for horizontally scaling the platform. Thanks to the implemented modular refactoring, adding new lessons, topics, or exercises **does not require modifying the core logic** of the application (Frontend/Backend).

The system operates under a **"Content as Data"** model: the voice logic is agnostic and adapts dynamically based on the configuration injected from the database.

---

## 🏗️ Content Creation Flow

To add a new lesson, the workflow focuses on a single entry point: the database seeding script (`seedDatabase`).

### Step 1: Define Content (Backend)

All pedagogical content resides in `server/drizzle/seedCourses.ts`. We use the `createLesson` helper function to standardize creation.

**Example: How to add "Lesson 7: Shopping"**

Open `server/drizzle/seedCourses.ts` and add this block to the end of the `seedDatabase` function:

```typescript
  // =========================
  // LESSON 7 – SHOPPING (NEW)
  // =========================
  await createLesson({
    order: 7, // Sequential order within the course
    lessonTitle: "Lesson 7 – Shopping & Prices",
    topicTitle: "Buying Clothes",
    topicSummary: "Vocabulary for sizes, colors, and asking for prices.", 
    promptSet: [
      // These are the 'triggers' guiding the AI logic
      "Greet the student and ask if they need help finding something.",
      "Ask what color t-shirt they prefer.",
      "Roleplay: Tell them the price is 20 dollars.",
      "Ask if they want to pay by cash or card.",
      "End the interaction politely."
    ],
  });

```

* **`topicSummary`**: Hidden instruction for the AI model (System Prompt).
* **`promptSet`**: The list of specific questions/interactions the AI will follow step-by-step.

### Step 2: Context Rules (Frontend - Optional)

If the new lesson uses very specific vocabulary that the voice transcriber might confuse (e.g., brand names, city names, technical jargon), you must update the **Context Bias** rules in the frontend.

File: `client/src/data/lessons.ts`

```typescript
const LESSON_7_RULES = `
- Context: CLOTHING STORE.
- Expected Vocabulary: Size, Small, Medium, Large, Cash, Credit Card, Receipt.
- Filter: Bias towards numbers (prices) and colors.
`;

// Add to the exported configuration
export const LESSONS_CONFIG = {
  // ... previous lessons ...
  7: {
    id: 7,
    title: "Lesson 7: Shopping",
    systemPrompt: buildSystemPrompt("Shopping", LESSON_7_RULES),
    // Questions now come from the DB, but this configures the Transcriber's "Brain"
  }
};

```

### Step 3: Deployment

Once the code is defined, the database must be updated. It is not necessary to manually restart the server if the seed command is used.

Run in terminal:

```bash
npm run db:seed

```

---

## 🧠 Prompt Engineering (Best Practices)

To maintain teaching quality, prompts defined in `seedCourses.ts` must follow these rules:

1. **Action Verbs:** Always start with "Ask", "Greet", "Correct", "Roleplay".
2. **Atomicity:** Each prompt must seek **a single** response from the user.
* ❌ *Bad:* "Ask them their name and where they live and how old they are."
* ✅ *Good:* "Ask them their name." -> (Next prompt) -> "Ask where they live."


3. **Soft Correction:** Include tone instructions, e.g., *"Correct gently if grammar is wrong"*.

---

## 🛠️ Troubleshooting

**New content does not appear on the Dashboard:**

1. Verify that `npm run db:seed` finished with the message: `✅ Database seeded successfully`.
2. If you changed the lesson order, ensure there are no duplicate numbers in the `order` field.

**AI hallucinates or misses keywords:**

1. Review the `RULES` in `client/src/data/lessons.ts`.
2. Ensure the `Context Bias` contains the expected keywords (e.g., if the lesson is about food, include "Pizza, Burger, Salad").

---

## 🔮 Future: Admin Panel

Thanks to this architecture, the logical next step is to build a visual interface (Admin Panel) that allows non-technical users (teachers) to fill out a form that executes the `createLesson` function in the background. The database structure is already prepared to support this without code changes.

```

```