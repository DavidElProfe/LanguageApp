import { db } from "../server/storage";
import * as schema from "../shared/schema";

async function seedCourses() {
  console.log("🌱 Sembrando datos de cursos (versión optimizada IA)...");

  try {
    const database = db!;

    // ========================================
    // CURSO PRINCIPAL
    // ========================================
    const [course] = await database
      .insert(schema.courses)
      .values({
        title: "Fundamentos de Inglés 1",
        description:
          "Beginner conversational English course for Spanish speakers. Focused on introductions, daily life, food, travel, and basic social conversations.",
      })
      .returning();

    console.log(`✅ Curso creado: ${course.title}`);

    // Helper para crear Lesson → Topic → AIChatActivity
    async function createLesson(opts: {
      order: number;
      lessonTitle: string;
      topicTitle: string;
      topicSummary: string;
      promptSet: string[];
    }) {
      const { order, lessonTitle, topicTitle, topicSummary, promptSet } = opts;

      // Crear Lesson
      const [lesson] = await database
        .insert(schema.lessons)
        .values({
          courseId: course.id,
          title: lessonTitle,
          order,
        })
        .returning();

      console.log(`📘 Lección creada: ${lesson.title}`);

      // Crear Topic
      const [topic] = await database
        .insert(schema.topics)
        .values({
          lessonId: lesson.id,
          title: topicTitle,
          summary: topicSummary,
        })
        .returning();

      console.log(`   ➕ Topic creado: ${topic.title}`);

      // Crear Actividad AIChat
      await database.insert(schema.activities).values({
        topicId: topic.id,
        type: "aiChat",
        data: {
          promptSet,
        },
      });

      console.log(`      🤖 AIChatActivity creada para ${topic.title}`);
    }

    // ========================================
    // Las 6 lecciones...
    // (ACÁ VA TODO TU CONTENIDO COMO LO TENÍAS)
    // ========================================

    console.log(
      "✨ Curso completo sembrado con 6 lecciones, 6 topics y 6 AIChat activities.",
    );
  } catch (error) {
    console.error("❌ Error al sembrar datos:", error);
    throw error;
  }
}

export async function seedDatabase() {
  return seedCourses();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedCourses()
    .then(() => {
      console.log("🎉 ¡Siembra completada!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Siembra fallida:", error);
      process.exit(1);
    });
}
