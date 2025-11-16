import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  Profile,
  InsertProfile,
  Course,
  Lesson,
  Topic,
  Activity,
  ActivityCompletion,
  InsertWaitlistEmail,
  AiSession,
  InsertAiSession,
  AiSessionMessage,
} from "@shared/schema";
import {
  Course as CourseModel,
  Lesson as LessonModel,
  Topic as TopicModel,
  VideoActivity,
  QuizletActivity,
  AIChatActivity,
} from "@shared/models";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

let db: ReturnType<typeof drizzle> | undefined;
if (hasDatabaseUrl) {
  const connectionString = process.env.DATABASE_URL as string;
  const client = postgres(connectionString);
  db = drizzle(client, { schema });
}

// Export a value so imports don't fail in dev when DB is absent
// Note: routes that rely on `db` should also guard with DATABASE_URL checks
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export { db };

export interface IStorage {
  // Profile operations
  getProfile(userId: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile & { id: string }): Promise<Profile>;
  updateProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile | undefined>;

  // Course operations (NEW OOP MODEL)
  getAllCourses(): Promise<Course[]>;
  getCourseWithContent(courseId: string): Promise<CourseModel | null>;

  // Activity completion operations
  completeActivity(userId: string, activityId: string): Promise<ActivityCompletion>;
  getUserCompletions(userId: string): Promise<ActivityCompletion[]>;
  getUserStreak(userId: string): Promise<number>;

  // Waitlist operations
  addToWaitlist(email: string): Promise<void>;

  // AI Session operations
  startAiSession(userId: string): Promise<AiSession>;
  endAiSession(sessionId: string): Promise<AiSession | undefined>;
  saveMessage(sessionId: string, role: string, content: string): Promise<AiSessionMessage>;
}

class DbStorage implements IStorage {
  private db = db!;
  // Profile operations
  async getProfile(userId: string): Promise<Profile | undefined> {
    const result = await this.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, userId))
      .limit(1);
    return result[0];
  }

  async createProfile(profile: InsertProfile & { id: string }): Promise<Profile> {
    const result = await this.db
      .insert(schema.profiles)
      .values(profile)
      .returning();
    return result[0];
  }

  async updateProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile | undefined> {
    const result = await this.db
      .update(schema.profiles)
      .set(data)
      .where(eq(schema.profiles.id, userId))
      .returning();
    return result[0];
  }

  // Course operations (NEW OOP MODEL)
  async getAllCourses(): Promise<Course[]> {
    return this.db.select().from(schema.courses);
  }

  async getCourseWithContent(courseId: string): Promise<CourseModel | null> {
    // Get course
    const courseResults = await this.db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .limit(1);

    if (courseResults.length === 0) return null;
    const course = courseResults[0];

    // Get lessons for this course
    const lessonResults = await this.db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.courseId, courseId))
      .orderBy(schema.lessons.order);

    const courseModel = new CourseModel(course.id, course.title, course.description);

    // For each lesson, get topics and activities
    for (const lesson of lessonResults) {
      const lessonModel = new LessonModel(lesson.id, lesson.title, lesson.order);

      // Get topics for this lesson
      const topicResults = await this.db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.lessonId, lesson.id));

      for (const topic of topicResults) {
        const topicModel = new TopicModel(topic.id, topic.title, topic.summary);

        // Get activities for this topic, ordered by type (videos first, then quizlet, then aiChat)
        const activityResults = await this.db
          .select()
          .from(schema.activities)
          .where(eq(schema.activities.topicId, topic.id))
          .orderBy(
            sql`CASE 
              WHEN ${schema.activities.type} = 'video' THEN 1
              WHEN ${schema.activities.type} = 'quizlet' THEN 2
              WHEN ${schema.activities.type} = 'aiChat' THEN 3
              ELSE 4
            END`
          );

        for (const activity of activityResults) {
          let activityModel;
          const data = activity.data as any;

          switch (activity.type) {
            case 'video':
              activityModel = new VideoActivity(activity.id, data.videoUrl);
              break;
            case 'quizlet':
              activityModel = new QuizletActivity(activity.id, data.embedUrl);
              break;
            case 'aiChat':
              activityModel = new AIChatActivity(activity.id, data.promptSet);
              break;
            default:
              continue;
          }

          topicModel.addActivity(activityModel);
        }

        lessonModel.addTopic(topicModel);
      }

      courseModel.addLesson(lessonModel);
    }

    return courseModel;
  }

  // Activity completion operations
  async completeActivity(userId: string, activityId: string): Promise<ActivityCompletion> {
    // Check if already completed
    const existing = await this.db
      .select()
      .from(schema.activityCompletions)
      .where(
        and(
          eq(schema.activityCompletions.userId, userId),
          eq(schema.activityCompletions.activityId, activityId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const result = await this.db
      .insert(schema.activityCompletions)
      .values({ userId, activityId })
      .returning();
    return result[0];
  }

  async getUserCompletions(userId: string): Promise<ActivityCompletion[]> {
    return this.db
      .select()
      .from(schema.activityCompletions)
      .where(eq(schema.activityCompletions.userId, userId))
      .orderBy(desc(schema.activityCompletions.completedAt));
  }

  async getUserStreak(userId: string): Promise<number> {
    // Get distinct days with activity, ordered by date descending
    const completions = await this.db
      .selectDistinct({
        date: sql<string>`DATE(${schema.activityCompletions.completedAt})`,
      })
      .from(schema.activityCompletions)
      .where(eq(schema.activityCompletions.userId, userId))
      .orderBy(desc(sql`DATE(${schema.activityCompletions.completedAt})`));

    if (completions.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < completions.length; i++) {
      const completionDate = new Date(completions[i].date);
      completionDate.setHours(0, 0, 0, 0);
      
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);
      expectedDate.setHours(0, 0, 0, 0);

      if (completionDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  // Waitlist operations
  async addToWaitlist(email: string): Promise<void> {
    await this.db
      .insert(schema.waitlistEmails)
      .values({ email })
      .onConflictDoNothing();
  }

  // AI Session operations
  async startAiSession(userId: string): Promise<AiSession> {
    const result = await this.db
      .insert(schema.aiSessions)
      .values({ userId: userId as any })
      .returning();
    return result[0];
  }

  async endAiSession(sessionId: string): Promise<AiSession | undefined> {
    const result = await this.db
      .update(schema.aiSessions)
      .set({ endedAt: new Date() })
      .where(eq(schema.aiSessions.id, sessionId))
      .returning();
    return result[0];
  }

  async saveMessage(sessionId: string, role: string, content: string): Promise<AiSessionMessage> {
    const result = await this.db
      .insert(schema.aiSessionMessages)
      .values({ sessionId: sessionId as any, role, content })
      .returning();
    return result[0];
  }
}

class DevStorage implements IStorage {
  private profiles = new Map<string, Profile>();
  private completions: ActivityCompletion[] = [] as any;

  async getProfile(userId: string): Promise<Profile | undefined> {
    return this.profiles.get(userId);
  }

  async createProfile(profile: InsertProfile & { id: string }): Promise<Profile> {
    const created: Profile = {
      id: profile.id,
      displayName: profile.displayName ?? null,
      locale: profile.locale ?? "en",
      currentTopicId: null,
      createdAt: new Date(),
    } as any;
    this.profiles.set(created.id, created);
    return created;
  }

  async updateProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile | undefined> {
    const existing = this.profiles.get(userId);
    if (!existing) return undefined;
    const updated = { ...existing, ...data } as Profile;
    this.profiles.set(userId, updated);
    return updated;
  }

  async getAllCourses(): Promise<Course[]> {
    // In dev without DB, return empty – routes have their own dev course fallback
    return [] as any;
  }

  async getCourseWithContent(_courseId: string): Promise<CourseModel | null> {
    // In dev without DB, return null – routes handle dev content
    return null;
  }

  async completeActivity(userId: string, activityId: string): Promise<ActivityCompletion> {
    const existing = this.completions.find(
      (c) => (c as any).userId === userId && (c as any).activityId === activityId,
    );
    if (existing) return existing;
    const completion: ActivityCompletion = {
      id: crypto.randomUUID(),
      userId: userId as any,
      activityId: activityId as any,
      completedAt: new Date(),
    } as any;
    this.completions.push(completion);
    return completion;
  }

  async getUserCompletions(userId: string): Promise<ActivityCompletion[]> {
    return this.completions
      .filter((c) => (c as any).userId === userId)
      .sort((a, b) => +new Date((b as any).completedAt) - +new Date((a as any).completedAt));
  }

  async getUserStreak(userId: string): Promise<number> {
    const dates = Array.from(
      new Set(
        this.completions
          .filter((c) => (c as any).userId === userId)
          .map((c) => new Date((c as any).completedAt).toISOString().slice(0, 10)),
      ),
    ).sort((a, b) => (a < b ? 1 : -1));
    if (dates.length === 0) return 0;
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      const expectedStr = expected.toISOString().slice(0, 10);
      if (dates[i] === expectedStr) streak++;
      else break;
    }
    return streak;
  }

  async addToWaitlist(_email: string): Promise<void> {
    // No-op in memory
    return;
  }

  async startAiSession(_userId: string): Promise<AiSession> {
    // Return mock session in dev mode
    return {
      id: crypto.randomUUID(),
      userId: _userId as any,
      startedAt: new Date(),
      endedAt: null,
    } as any;
  }

  async endAiSession(_sessionId: string): Promise<AiSession | undefined> {
    // Return mock ended session in dev mode
    return {
      id: _sessionId,
      userId: crypto.randomUUID() as any,
      startedAt: new Date(),
      endedAt: new Date(),
    } as any;
  }

  async saveMessage(sessionId: string, role: string, content: string): Promise<AiSessionMessage> {
    // Return mock message in dev mode
    return {
      id: crypto.randomUUID(),
      sessionId: sessionId as any,
      role,
      content,
      createdAt: new Date(),
    } as any;
  }
}

export const storage: IStorage = hasDatabaseUrl ? new DbStorage() : new DevStorage();
