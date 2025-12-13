import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  jsonb,
  uuid,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Profiles table - extends Supabase auth.users
// Note: id corresponds to Supabase auth.users.id (UUID)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // No foreign key - Supabase manages auth
  displayName: text("display_name"),
  email: text("email"), // User's email for easy reference
  locale: text("locale").default("en").notNull(),
  currentTopicId: uuid("current_topic_id"), // Track user's current/last topic for "continue learning"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Courses table
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Lessons table
export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Topics table
export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity types
export type ActivityType = "video" | "quizlet" | "chat";

// Activities table
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "video" | "quizlet" | "chat"
  data: jsonb("data").notNull(), // { videoUrl } | { quizletId } | { assistantId }
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity completions table (replaces progress_events)
export const activityCompletions = pgTable(
  "activity_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserActivity: unique().on(table.userId, table.activityId),
  }),
);

// Waitlist emails table
export const waitlistEmails = pgTable("waitlist_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Sessions table - tracks AI conversation usage
export const aiSessions = pgTable("ai_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  state: text("state").default("INTRO").notNull(), // <-- this atribute
});

// AI Session Messages table - stores conversation transcript
export const aiSessionMessages = pgTable("ai_session_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => aiSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertProfileSchema = createInsertSchema(profiles).omit({
  id: true,
  createdAt: true,
});

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
  createdAt: true,
});

export const insertLessonSchema = createInsertSchema(lessons).omit({
  id: true,
  createdAt: true,
});

export const insertTopicSchema = createInsertSchema(topics).omit({
  id: true,
  createdAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

export const insertActivityCompletionSchema = createInsertSchema(
  activityCompletions,
).omit({
  id: true,
  completedAt: true,
});

export const insertWaitlistEmailSchema = createInsertSchema(
  waitlistEmails,
).omit({
  id: true,
  createdAt: true,
});

export const insertAiSessionSchema = createInsertSchema(aiSessions).omit({
  id: true,
  startedAt: true,
});

export const insertAiSessionMessageSchema = createInsertSchema(
  aiSessionMessages,
).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;

export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessons.$inferSelect;

export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topics.$inferSelect;

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

export type InsertActivityCompletion = z.infer<
  typeof insertActivityCompletionSchema
>;
export type ActivityCompletion = typeof activityCompletions.$inferSelect;

export type InsertWaitlistEmail = z.infer<typeof insertWaitlistEmailSchema>;
export type WaitlistEmail = typeof waitlistEmails.$inferSelect;

export type InsertAiSession = z.infer<typeof insertAiSessionSchema>;
export type AiSession = typeof aiSessions.$inferSelect;

export type InsertAiSessionMessage = z.infer<
  typeof insertAiSessionMessageSchema
>;
export type AiSessionMessage = typeof aiSessionMessages.$inferSelect;
