import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

export interface SessionContext {
  userId: string;
  sessionId: string;
  state: string;
  courseId?: string;
  courseTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
  topicId?: string;
  topicTitle?: string;
  topicSummary?: string;
  promptSet?: string;
}

export async function loadSessionContext(
  userId: string,
  sessionId: string,
  topicId?: string
): Promise<SessionContext> {
  const context: SessionContext = {
    userId,
    sessionId,
    state: "INTRO",
  };

  try {
    const sessions = await db
      .select()
      .from(schema.aiSessions)
      .where(eq(schema.aiSessions.id, sessionId))
      .limit(1);

    if (sessions.length > 0 && sessions[0].state) {
      context.state = sessions[0].state;
    }
  } catch (error) {
    console.error("Error loading session state:", error);
  }

  if (topicId) {
    try {
      const topics = await db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.id, topicId))
        .limit(1);

      if (topics.length > 0) {
        const topic = topics[0];
        context.topicId = topic.id;
        context.topicTitle = topic.title;
        context.topicSummary = topic.summary;

        if (topic.lessonId) {
          const lessons = await db
            .select()
            .from(schema.lessons)
            .where(eq(schema.lessons.id, topic.lessonId))
            .limit(1);

          if (lessons.length > 0) {
            const lesson = lessons[0];
            context.lessonId = lesson.id;
            context.lessonTitle = lesson.title;

            if (lesson.courseId) {
              const courses = await db
                .select()
                .from(schema.courses)
                .where(eq(schema.courses.id, lesson.courseId))
                .limit(1);

              if (courses.length > 0) {
                context.courseId = courses[0].id;
                context.courseTitle = courses[0].title;
              }
            }
          }
        }

        const activities = await db
          .select()
          .from(schema.activities)
          .where(eq(schema.activities.topicId, topicId))
          .limit(10);

        const chatActivity = activities.find((a) => a.type === "chat" || a.type === "aiChat");
        if (chatActivity && chatActivity.data) {
          const data = chatActivity.data as { promptSet?: string };
          if (data.promptSet) {
            context.promptSet = data.promptSet;
          }
        }
      }
    } catch (error) {
      console.error("Error loading topic context:", error);
    }
  }

  return context;
}

export async function updateSessionState(
  sessionId: string,
  newState: string
): Promise<void> {
  try {
    await db
      .update(schema.aiSessions)
      .set({ state: newState })
      .where(eq(schema.aiSessions.id, sessionId));
  } catch (error) {
    console.error("Error updating session state:", error);
  }
}
