import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { supabaseAdmin, getSupabaseClient } from "./lib/supabase";
import {
  insertWaitlistEmailSchema,
  insertAiSessionMessageSchema,
} from "@shared/schema";
import { generateAIReply } from "./lib/ai";
import * as schema from "@shared/schema";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { assistantRouter } from "./assistantRoutes";
import { ttsRouter } from "./ttsRoutes";
import { estimateSessionCost, logSessionCost } from "./utils/costEstimator";
import {
  runLessonPipeline,
  type PipelineInput,
  type LessonStep,
} from "./utils/LessonPipeline";

interface AuthRequest extends Request {
  user?: any;
}

async function authenticateUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.user = user;
  next();
}

async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(req.headers.authorization?.substring(7));

  if (!user?.app_metadata?.role || user.app_metadata.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  function getDevCoursesList() {
    return [
      {
        id: "dev-course-1",
        title: "Fundamentos de Inglés 1",
        description:
          "Curso introductorio de inglés que cubre saludos, presentaciones y vocabulario esencial",
      },
    ];
  }

  function getDevCourseWithContent(courseId: string) {
    if (courseId !== "dev-course-1") return null;
    return {
      id: "dev-course-1",
      title: "Fundamentos de Inglés 1",
      description:
        "Curso introductorio de inglés que cubre saludos, presentaciones y vocabulario esencial",
      lessons: [
        {
          id: "dev-lesson-1",
          title: "Lección 1",
          order: 1,
          topics: [
            {
              id: "dev-topic-1",
              title: "Presentaciones",
              summary:
                "Aprende a presentarte y conocer a otras personas en inglés",
              activities: [
                {
                  id: "dev-act-1",
                  type: "video",
                  data: {
                    videoUrl:
                      "https://www.youtube.com/watch?v=g9BERd6yRLI&t=1483s",
                  },
                },
                {
                  id: "dev-act-2",
                  type: "quizlet",
                  data: {
                    embedUrl:
                      "https://quizlet.com/509361526/flashcards/embed?i=nd4dc&x=1jj1&locale=es",
                  },
                },
              ],
            },
            {
              id: "dev-topic-2",
              title: "Preguntas Comunes",
              summary:
                "Domina las preguntas más frecuentes en conversaciones básicas",
              activities: [
                {
                  id: "dev-act-3",
                  type: "video",
                  data: {
                    videoUrl: "https://www.youtube.com/watch?v=F_uXNeQd0Ok",
                  },
                },
                {
                  id: "dev-act-4",
                  type: "quizlet",
                  data: {
                    embedUrl:
                      "https://quizlet.com/1098715669/match/embed?i=nd4dc&x=1jj1",
                  },
                },
              ],
            },
          ],
        },
      ],
    } as any;
  }

  app.get("/api/config", (req, res) => {
    let supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://mytdwuuzzbmxftpwofsa.supabase.co";
    let supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15dGR3dXV6emJteGZ0cHdvZnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTgyOTQsImV4cCI6MjA3NTY5NDI5NH0.Qhz2gXC1Ic_-mJsYtKv5H35r0oLW1JbBKwlWvdUi6eM";

    if (supabaseUrl.startsWith("eyJ") && supabaseAnonKey.startsWith("http")) {
      [supabaseUrl, supabaseAnonKey] = [supabaseAnonKey, supabaseUrl];
    }

    res.json({
      supabaseUrl,
      supabaseAnonKey,
    });
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, name } = req.body;

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name || email.split("@")[0],
        },
      });

      if (error) throw error;

      await storage.createProfile({
        id: data.user.id,
        displayName: name || email.split("@")[0],
        email: email,
        locale: "en",
      });

      res.json({ user: data.user });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { email, password } = req.body;

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const existingProfile = await storage.getProfile(data.user.id);
        if (!existingProfile) {
          await storage.createProfile({
            id: data.user.id,
            displayName: email.split("@")[0],
            email: email,
            locale: "en",
          });
        }
      }

      res.json({ session: data.session, user: data.user });
    } catch (error: any) {
      console.error("Signin error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/signout", authenticateUser, async (req, res) => {
    try {
      const supabase = getSupabaseClient(
        req.headers.authorization?.substring(7),
      );
      const { error } = await supabase.auth.signOut();

      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error("Signout error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/profile", authenticateUser, async (req: AuthRequest, res) => {
    try {
      const { id, displayName, locale } = req.body;
      const profile = await storage.createProfile({
        id: id || req.user!.id,
        displayName: displayName || req.user!.email?.split("@")[0] || "User",
        email: req.user!.email,
        locale: locale || "en",
      });
      res.json(profile);
    } catch (error: any) {
      console.error("Create profile error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post(
    "/api/profile/ensure",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const { userId, email, name } = req.body;
        const targetUserId = userId || req.user!.id;
        const userEmail = email || req.user!.email;

        const existingProfile = await storage.getProfile(targetUserId);

        if (!existingProfile) {
          const profile = await storage.createProfile({
            id: targetUserId,
            displayName: name || userEmail?.split("@")[0] || "User",
            email: userEmail,
            locale: "en",
          });
          res.json({ created: true, profile });
        } else {
          if (!existingProfile.email && userEmail) {
            await storage.updateProfile(targetUserId, { email: userEmail });
          }
          res.json({ created: false, profile: existingProfile });
        }
      } catch (error: any) {
        console.error("Ensure profile error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get("/api/profile", authenticateUser, async (req: AuthRequest, res) => {
    try {
      const profile = await storage.getProfile(req.user!.id);
      res.json(profile);
    } catch (error: any) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/profile", authenticateUser, async (req: AuthRequest, res) => {
    try {
      const profile = await storage.updateProfile(req.user!.id, req.body);
      res.json(profile);
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/courses", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.json(getDevCoursesList());
      }
      const basicCourses = await storage.getAllCourses();

      const coursesWithContent = await Promise.all(
        basicCourses.map(async (course) => {
          const fullCourse = await storage.getCourseWithContent(course.id);
          return fullCourse || course;
        }),
      );

      res.json(coursesWithContent);
    } catch (error: any) {
      console.error("Get courses error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/courses/:id", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        const devCourse = getDevCourseWithContent(req.params.id);
        if (!devCourse)
          return res.status(404).json({ error: "Course not found" });
        return res.json(devCourse);
      }
      const course = await storage.getCourseWithContent(req.params.id);

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json(course);
    } catch (error: any) {
      console.error("Get course error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post(
    "/api/activities/:id/complete",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const userId = req.user!.id;
        const activityId = req.params.id;

        const completion = await storage.completeActivity(userId, activityId);

        const completions = await storage.getUserCompletions(userId);
        const completedActivityIds = new Set(
          completions.map((c) => c.activityId),
        );

        const courses = await storage.getAllCourses();
        let currentTopicComplete = false;
        let currentTopicId: string | null = null;

        for (const courseData of courses) {
          const course = await storage.getCourseWithContent(courseData.id);
          if (!course) continue;

          for (const lesson of course.lessons) {
            for (const topic of lesson.topics) {
              const hasThisActivity = topic.activities.some(
                (a) => a.id === activityId,
              );
              if (hasThisActivity) {
                currentTopicId = topic.id;
                currentTopicComplete = topic.activities.every((activity) =>
                  completedActivityIds.has(activity.id),
                );
                break;
              }
            }
            if (currentTopicId) break;
          }
          if (currentTopicId) break;
        }

        if (currentTopicComplete) {
          let foundNextTopic = false;

          for (const courseData of courses) {
            const course = await storage.getCourseWithContent(courseData.id);
            if (!course) continue;

            for (const lesson of course.lessons) {
              for (const topic of lesson.topics) {
                if (topic.id === currentTopicId) {
                  foundNextTopic = true;
                  continue;
                }

                if (foundNextTopic) {
                  const hasIncompleteActivity = topic.activities.some(
                    (activity) => !completedActivityIds.has(activity.id),
                  );

                  if (hasIncompleteActivity || topic.activities.length === 0) {
                    await storage.updateProfile(userId, {
                      currentTopicId: topic.id,
                    });
                    return res.json(completion);
                  }
                }
              }
            }
          }
        } else {
          if (currentTopicId) {
            await storage.updateProfile(userId, { currentTopicId });
          }
        }

        res.json(completion);
      } catch (error: any) {
        console.error("Complete activity error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/completions",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const completions = await storage.getUserCompletions(req.user!.id);
        res.json(completions);
      } catch (error: any) {
        console.error("Get completions error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post("/api/waitlist", async (req, res) => {
    try {
      const validated = insertWaitlistEmailSchema.parse(req.body);
      await storage.addToWaitlist(validated.email);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Waitlist error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post(
    "/api/ai-sessions/start",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const session = await storage.startAiSession(req.user!.id);
        res.json(session);
      } catch (error: any) {
        console.error("Start AI session error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/ai-sessions/end/:sessionId",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const session = await storage.endAiSession(req.params.sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (session.startedAt && session.endedAt) {
          const costEstimate = estimateSessionCost(
            session.id,
            new Date(session.startedAt),
            new Date(session.endedAt),
          );
          logSessionCost(costEstimate);
        }

        res.json(session);
      } catch (error: any) {
        console.error("End AI session error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/ai-sessions/:sessionId/messages",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const { sessionId } = req.params;
        const validated = insertAiSessionMessageSchema
          .omit({ sessionId: true })
          .parse(req.body);

        const message = await storage.saveMessage(
          sessionId,
          validated.role,
          validated.content,
        );

        res.json(message);
      } catch (error: any) {
        console.error("Save message error:", error);
        res.status(400).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/dashboard/stats",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const completions = await storage.getUserCompletions(req.user!.id);
        const courses = await storage.getAllCourses();

        const streak = await storage.getUserStreak(req.user!.id);

        const lastActivity =
          completions.length > 0
            ? completions[completions.length - 1].completedAt
            : null;

        let totalActivities = 0;
        for (const course of courses) {
          const fullCourse = await storage.getCourseWithContent(course.id);
          if (fullCourse) {
            for (const lesson of fullCourse.lessons) {
              for (const topic of lesson.topics) {
                totalActivities += topic.activities.length;
              }
            }
          }
        }

        const progressPercentage =
          totalActivities > 0
            ? Math.round((completions.length / totalActivities) * 100)
            : 0;

        res.json({
          streak,
          lastActivity,
          progressPercentage,
          totalActivities,
          completedActivities: completions.length,
        });
      } catch (error: any) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post("/api/ai/chat", authenticateUser, async (req: AuthRequest, res) => {
    try {
      const { messages, context, sessionId, userMessage } = req.body || {};

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const lastUserMessage =
        userMessage ||
        (Array.isArray(messages)
          ? messages.filter((m: any) => m.role === "user").pop()?.content
          : null);

      if (!lastUserMessage) {
        return res.status(400).json({ error: "userMessage is required" });
      }

      const safeContext = {
        courseTitle: context?.courseTitle || null,
        lessonTitle: context?.lessonTitle || null,
        topicTitle: context?.topicTitle || null,
        topicId: context?.topicId || null,
        activityType: context?.activityType || null,
        promptSet: Array.isArray(context?.promptSet)
          ? context.promptSet.slice(0, 10)
          : [],
        userId: req.user!.id,
        sessionId,
        userMessage: lastUserMessage,
      };

      const reply = await generateAIReply(
        Array.isArray(messages) ? messages : [],
        safeContext,
      );
      res.json({
        message: reply,
        state: reply.state,
      });
    } catch (error: any) {
      console.error("AI chat error:", error);
      res.status(500).json({ error: error.message || "AI error" });
    }
  });

  app.post(
    "/api/ai/chat/pipeline",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const { userMessage, sessionId, context, messages } = req.body;
        const userId = req.user!.id;

        if (!sessionId || !userMessage) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const history = Array.isArray(messages)
          ? messages.map((m: any) => ({ role: m.role, content: m.content }))
          : [];

        let course = null;
        if (context?.courseId) {
          course = await storage.getCourseWithContent(context.courseId);
        }

        let currentStep: LessonStep | null = null;
        let nextStep: LessonStep | undefined = undefined;
        let foundCurrent = false;

        if (course && context?.topicId) {
          for (const lesson of course.lessons) {
            lesson.topics.forEach((topic: any, index: number) => {
              if (topic.id === context.topicId) {
                currentStep = {
                  index: index,
                  internalGoal: topic.title,
                  aiInstruction:
                    topic.summary || "Teach this topic interactively",
                  expectedUserIntent: "learn_topic",
                };
                foundCurrent = true;
              } else if (foundCurrent && !nextStep) {
                nextStep = {
                  index: index,
                  internalGoal: topic.title,
                  aiInstruction: topic.summary || "Move to next topic",
                  expectedUserIntent: "learn_topic",
                };
              }
            });
            if (foundCurrent && nextStep) break;
          }
        }

        if (!currentStep) {
          currentStep = {
            index: 0,
            internalGoal: "general_chat",
            aiInstruction: "Respond helpfully to the user",
            expectedUserIntent: "chat",
          };
        }

        const pipelineInput: PipelineInput = {
          userText: userMessage,
          history: history,
          currentStep: currentStep,
          nextStep: nextStep,
          userProgress: {
            currentStepIndex: currentStep.index,
            failedAttempts: 0,
            isLessonComplete: false,
          },
        };

        const result = await runLessonPipeline(pipelineInput);

        await storage.saveMessage(sessionId, "user", userMessage);
        await storage.saveMessage(sessionId, "assistant", result.aiResponse);

        res.json({
          message: { content: result.aiResponse, role: "assistant" },
          state: {
            passed: result.isValid,
            feedback: result.feedback,
            nextStepAvailable: !!nextStep,
            updatedProgress: result.updatedProgress,
          },
        });
      } catch (error: any) {
        console.error("Pipeline error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/dashboard/next-topic",
    authenticateUser,
    async (req: AuthRequest, res) => {
      try {
        const userId = req.user!.id;

        const profile = await storage.getProfile(userId);

        const completions = await storage.getUserCompletions(userId);
        const completedActivityIds = new Set(
          completions.map((c) => c.activityId),
        );

        const courses = await storage.getAllCourses();

        const getNextActivityPath = (topic: any, lesson: any, course: any) => {
          const videoActivity = topic.activities.find(
            (a: any) => a.type === "video",
          );
          const flashcardActivity = topic.activities.find(
            (a: any) => a.type === "quizlet",
          );

          const videoCompleted =
            videoActivity && completedActivityIds.has(videoActivity.id);
          const flashcardCompleted =
            flashcardActivity && completedActivityIds.has(flashcardActivity.id);

          if (!videoCompleted && videoActivity) {
            return `/courses/${course.id}/lessons/${lesson.id}/topics/${topic.id}`;
          } else if (!flashcardCompleted && flashcardActivity) {
            return `/courses/${course.id}/lessons/${lesson.id}/topics/${topic.id}/flashcards`;
          } else {
            return `/courses/${course.id}/lessons/${lesson.id}/topics/${topic.id}`;
          }
        };

        if (profile?.currentTopicId) {
          for (const courseData of courses) {
            const course = await storage.getCourseWithContent(courseData.id);
            if (course) {
              for (const lesson of course.lessons) {
                const topic = lesson.topics.find(
                  (t) => t.id === profile.currentTopicId,
                );
                if (topic) {
                  return res.json({
                    topicId: topic.id,
                    topicTitle: topic.title,
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    courseId: course.id,
                    courseTitle: course.title,
                    navigationPath: getNextActivityPath(topic, lesson, course),
                  });
                }
              }
            }
          }
        }

        for (const courseData of courses) {
          const course = await storage.getCourseWithContent(courseData.id);
          if (!course) continue;

          for (const lesson of course.lessons) {
            for (const topic of lesson.topics) {
              const hasIncompleteActivity = topic.activities.some(
                (activity) => !completedActivityIds.has(activity.id),
              );

              if (hasIncompleteActivity || topic.activities.length === 0) {
                await storage.updateProfile(userId, {
                  currentTopicId: topic.id,
                });

                return res.json({
                  topicId: topic.id,
                  topicTitle: topic.title,
                  lessonId: lesson.id,
                  lessonTitle: lesson.title,
                  courseId: course.id,
                  courseTitle: course.title,
                  navigationPath: getNextActivityPath(topic, lesson, course),
                });
              }
            }
          }
        }

        if (courses.length > 0) {
          const course = await storage.getCourseWithContent(courses[0].id);
          if (
            course &&
            course.lessons.length > 0 &&
            course.lessons[0].topics.length > 0
          ) {
            const lesson = course.lessons[0];
            const topic = lesson.topics[0];

            return res.json({
              topicId: topic.id,
              topicTitle: topic.title,
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              courseId: course.id,
              courseTitle: course.title,
              navigationPath: getNextActivityPath(topic, lesson, course),
            });
          }
        }

        res.status(404).json({ error: "No topics found" });
      } catch (error: any) {
        console.error("Next topic error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/admin/analytics",
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        if (!process.env.DATABASE_URL) {
          return res.json({
            users: [],
            platformStats: {
              totalUsers: 0,
              activeUsers: 0,
              totalCompletions: 0,
              avgCompletionsPerUser: 0,
            },
          });
        }
        const database = db!;
        const profiles = await database.select().from(schema.profiles);

        const allCompletions = await database
          .select()
          .from(schema.activityCompletions)
          .orderBy(desc(schema.activityCompletions.completedAt));

        const userAnalytics = await Promise.all(
          profiles.map(async (profile: any) => {
            const userCompletions = await storage.getUserCompletions(
              profile.id,
            );
            const streak = await storage.getUserStreak(profile.id);

            return {
              id: profile.id,
              displayName: profile.displayName || "Usuario",
              email: profile.id,
              totalActivities: userCompletions.length,
              streak,
              lastActivity:
                userCompletions.length > 0
                  ? userCompletions[0].completedAt
                  : null,
              createdAt: profile.createdAt,
            };
          }),
        );

        const totalUsers = profiles.length;
        const totalCompletions = allCompletions.length;
        const activeUsers = userAnalytics.filter(
          (u: any) => u.totalActivities > 0,
        ).length;
        const avgCompletionsPerUser =
          totalUsers > 0 ? (totalCompletions / totalUsers).toFixed(1) : 0;

        res.json({
          users: userAnalytics,
          platformStats: {
            totalUsers,
            activeUsers,
            totalCompletions,
            avgCompletionsPerUser,
          },
        });
      } catch (error: any) {
        console.error("Admin analytics error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post("/api/admin/seed", async (req, res) => {
    try {
      const existingCourses = await storage.getAllCourses();
      if (existingCourses.length > 0) {
        return res.json({
          success: true,
          message: `Base de datos ya tiene ${existingCourses.length} curso(s). No se requiere sembrar.`,
          courses: existingCourses.length,
        });
      }

      const { seedDatabase } = await import("../drizzle/seedCourses");
      await seedDatabase();

      const courses = await storage.getAllCourses();

      res.json({
        success: true,
        message: "✅ Base de datos sembrada exitosamente",
        courses: courses.length,
      });
    } catch (error: any) {
      console.error("Seed error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.use("/api/assistant", assistantRouter);
  app.use("/api/tts", ttsRouter);

  const httpServer = createServer(app);
  return httpServer;
}
