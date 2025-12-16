import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Courses from "@/pages/Courses";
import CourseDetail from "@/pages/CourseDetail";
import LessonDetail from "@/pages/LessonDetail";
import TopicDetail from "@/pages/TopicDetail";
import TopicFlashcards from "@/pages/TopicFlashcards";
import AIChatActivity from "@/pages/AIChatActivity";
import ChatPartner from "@/pages/ChatPartner";

import SimpleMode from "@/pages/SimpleMode";
import TopicRedirect from "@/pages/TopicRedirect";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Pricing from "@/pages/Pricing";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";
import ProtectedRoute from "@/components/ProtectedRoute";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute>
          <ChatPartner />
        </ProtectedRoute>
      </Route>
      <Route path="/auth" component={Auth} />
      <Route path="/home" component={Home} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/courses">
        <ProtectedRoute>
          <Courses />
        </ProtectedRoute>
      </Route>
      <Route path="/courses/:id">
        <ProtectedRoute>
          <CourseDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/courses/:courseId/lessons/:lessonId">
        <ProtectedRoute>
          <LessonDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/courses/:courseId/lessons/:lessonId/topics/:topicId">
        <ProtectedRoute>
          <TopicDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/courses/:courseId/lessons/:lessonId/topics/:topicId/flashcards">
        <ProtectedRoute>
          <TopicFlashcards />
        </ProtectedRoute>
      </Route>
      <Route path="/courses/:courseId/lessons/:lessonId/topics/:topicId/chat">
        <ProtectedRoute>
          <AIChatActivity />
        </ProtectedRoute>
      </Route>
      <Route path="/topic/:topicId">
        <ProtectedRoute>
          <TopicRedirect />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/admin" component={Admin} />
      <Route path="/simple">
        <ProtectedRoute>
          <SimpleMode />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </LanguageProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
