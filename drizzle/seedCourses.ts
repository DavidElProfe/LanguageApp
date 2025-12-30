import { db } from "../server/storage";
import * as schema from "../shared/schema";

export async function seedCourses() {
  if (!db) {
    throw new Error("Database not available");
  }

  // =========================
  // COURSE
  // =========================
  const [course] = await db
    .insert(schema.courses)
    .values({
      title: "Fundamentos de Inglés 1",
      description:
        "Beginner conversational English course focused on real-life communication with an AI conversation partner.",
    })
    .returning();

  // Helper: create Lesson → Topic → AI Chat Activity
  async function createLesson(opts: {
    order: number;
    lessonTitle: string;
    topicTitle: string;
    topicSummary: string;
    promptSet: string[];
  }) {
    const { order, lessonTitle, topicTitle, topicSummary, promptSet } = opts;

    const [lesson] = await db
      .insert(schema.lessons)
      .values({
        courseId: course.id,
        title: lessonTitle,
        order,
      })
      .returning();

    const [topic] = await db
      .insert(schema.topics)
      .values({
        lessonId: lesson.id,
        title: topicTitle,
        summary: topicSummary,
      })
      .returning();

    await db.insert(schema.activities).values({
      topicId: topic.id,
      type: "chat",
      data: {
        promptSet,
      },
    });
  }

  // =========================
  // LESSON 1 – INTRODUCTIONS
  // =========================
  await createLesson({
    order: 1,
    lessonTitle: "Lesson 1 – Introductions & Personal Information",
    topicTitle: "Introductions",
    topicSummary:
      "Learn to greet people, say your name, country, age, and basic personal information.",
    promptSet: [
      "Greet the student and ask for their name.",
      "Ask where they are from and help form a full sentence.",
      "Practice saying: 'Nice to meet you.'",
      "Ask the student to spell their name.",
      "Ask how old they are and correct gently if needed.",
      "Give positive feedback and encouragement.",
    ],
  });

  // =========================
  // LESSON 2 – DESCRIBING PEOPLE
  // =========================
  await createLesson({
    order: 2,
    lessonTitle: "Lesson 2 – Describing Yourself & Others",
    topicTitle: "Describing People",
    topicSummary:
      "Use simple adjectives to describe yourself and other people.",
    promptSet: [
      "Ask the student to describe themselves.",
      "Ask about personality: shy, friendly, outgoing.",
      "Ask what they like or dislike.",
      "Ask them to describe a friend or family member.",
      "Correct softly and keep explanations simple.",
    ],
  });

  // =========================
  // LESSON 3 – DAILY LIFE
  // =========================
  await createLesson({
    order: 3,
    lessonTitle: "Lesson 3 – Daily Life & Routines",
    topicTitle: "Daily Activities",
    topicSummary:
      "Talk about daily routines and hobbies using the present simple.",
    promptSet: [
      "Ask about their morning routine.",
      "Ask what they do in their free time.",
      "Ask about weekends.",
      "Practice yes/no questions.",
      "Praise effort and fluency.",
    ],
  });

  // =========================
  // LESSON 4 – FOOD
  // =========================
  await createLesson({
    order: 4,
    lessonTitle: "Lesson 4 – Food & Preferences",
    topicTitle: "Eating Out",
    topicSummary: "Practice food vocabulary and ordering in a restaurant.",
    promptSet: [
      "Ask what food they like.",
      "Ask about breakfast, lunch, or dinner.",
      "Roleplay ordering food.",
      "Practice: 'I would like…'",
      "Give friendly corrections.",
    ],
  });

  // =========================
  // LESSON 5 – TRAVEL
  // =========================
  await createLesson({
    order: 5,
    lessonTitle: "Lesson 5 – Travel & Directions",
    topicTitle: "Getting Around",
    topicSummary: "Practice travel language and asking for directions.",
    promptSet: [
      "Ask if they like to travel.",
      "Ask where they want to go.",
      "Practice: 'Where is…?'",
      "Teach left / right / straight.",
      "Check understanding before moving on.",
    ],
  });

  // =========================
  // LESSON 6 – SOCIAL ENGLISH
  // =========================
  await createLesson({
    order: 6,
    lessonTitle: "Lesson 6 – Social English",
    topicTitle: "Small Talk",
    topicSummary: "Have relaxed conversations like chatting with a friend.",
    promptSet: [
      "Ask about music or movies.",
      "Ask about family.",
      "Ask about weekend plans.",
      "Do café-style small talk.",
      "End with positive feedback.",
    ],
  });
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  seedCourses()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
