"use client";

import { useRequireAuth } from "@/lib/hooks/use-auth";
import { DashboardLayout } from "@/components/layout";
import {
  BookOpen,
  Brain,
  MessageCircle,
  TrendingUp,
  Sparkles,
  Clock,
  Target,
} from "lucide-react";

/**
 * Dashboard Page (Protected Route)
 *
 * Main dashboard showing user progress, quick actions, and learning overview.
 */
export default function DashboardPage() {
  const { isLoading } = useRequireAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Welcome back! Ready to continue your Mandarin journey?"
    >
      <div className="p-6 space-y-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-[#4040f2] to-[#6366f1] rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-inter font-bold">
                Welcome to Mandareen! 🎉
              </h2>
              <p className="text-blue-100 font-inter">
                Your AI-powered Mandarin learning companion is ready to help you
                achieve fluency.
              </p>
            </div>
            <div className="hidden md:block">
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-4xl">普</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Current Level
                </p>
                <p className="text-white text-xl font-inter font-semibold">
                  Not Assessed
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Words Learned
                </p>
                <p className="text-white text-xl font-inter font-semibold">0</p>
              </div>
            </div>
          </div>

          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-[#a6a6a6] text-sm font-inter">
                  Study Streak
                </p>
                <p className="text-white text-xl font-inter font-semibold">
                  0 days
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h3 className="text-xl font-inter font-semibold text-white">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Placement Test - Available */}
            <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-[#4040f2] transition-all duration-200 cursor-pointer group">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors duration-200">
                  <Target className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    Take Placement Test
                  </h4>
                  <p className="text-sm text-[#a6a6a6] font-inter">
                    Assess your current Mandarin level
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-xs text-green-400 font-inter">
                    Available
                  </span>
                </div>
              </div>
            </div>

            {/* AI Lessons - Coming Soon */}
            <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] opacity-60 relative overflow-hidden">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    AI Lessons
                  </h4>
                  <p className="text-sm text-[#a6a6a6] font-inter">
                    Personalized learning content
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-[#999999]" />
                  <span className="text-xs text-[#999999] font-inter">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Flashcards - Coming Soon */}
            <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] opacity-60 relative overflow-hidden">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Brain className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    Flashcards
                  </h4>
                  <p className="text-sm text-[#a6a6a6] font-inter">
                    Spaced repetition practice
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-[#999999]" />
                  <span className="text-xs text-[#999999] font-inter">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Conversation - Coming Soon */}
            <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] opacity-60 relative overflow-hidden">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    AI Conversation
                  </h4>
                  <p className="text-sm text-[#a6a6a6] font-inter">
                    Real-time practice sessions
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-[#999999]" />
                  <span className="text-xs text-[#999999] font-inter">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <h3 className="text-lg font-inter font-semibold text-white mb-4">
            Getting Started
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <p className="text-[#a6a6a6] font-inter">
                Take your placement test to determine your current level
              </p>
            </div>
            <div className="flex items-center gap-3 opacity-60">
              <div className="w-6 h-6 bg-[#404040] rounded-full flex items-center justify-center">
                <span className="text-[#999999] text-xs font-bold">2</span>
              </div>
              <p className="text-[#999999] font-inter">
                Start with AI-generated lessons tailored to your level
              </p>
            </div>
            <div className="flex items-center gap-3 opacity-60">
              <div className="w-6 h-6 bg-[#404040] rounded-full flex items-center justify-center">
                <span className="text-[#999999] text-xs font-bold">3</span>
              </div>
              <p className="text-[#999999] font-inter">
                Practice with flashcards and conversation AI
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
