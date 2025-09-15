"use client";

import { useRequireAuth } from "@/lib/hooks/use-auth";
import { DashboardLayout } from "@/components/layout";
import { useCurrentLevel } from "@/lib/hooks/use-current-level";
import { useEffect, useState } from "react";
import { assessmentApi } from "@/lib/api/assessment";
import {
  BookOpen,
  Brain,
  MessageCircle,
  TrendingUp,
  Sparkles,
  Clock,
  Target,
  RefreshCw,
} from "lucide-react";

/**
 * Dashboard Page (Protected Route)
 *
 * Main dashboard showing user progress, quick actions, and learning overview.
 */
export default function DashboardPage() {
  const { isLoading } = useRequireAuth();
  const {
    isLoading: levelLoading,
    formatLevel,
    getLevelColor,
    refreshLevel,
  } = useCurrentLevel();

  const [history, setHistory] = useState<
    Array<{ id: number; levelPlaced: number; takenAt: string }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await assessmentApi.getHistory();
        if (isMounted) setHistory(data);
      } catch {
        if (isMounted) setHistoryError("Failed to load assessment history");
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };
    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, []);

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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-[#a6a6a6] text-sm font-inter">
                    Current Level
                  </p>
                  {levelLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span className="text-[#a6a6a6] text-sm font-inter">
                        Loading...
                      </span>
                    </div>
                  ) : (
                    <p
                      className={`text-xl font-inter font-semibold ${getLevelColor()}`}
                    >
                      {formatLevel()}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={refreshLevel}
                disabled={levelLoading}
                className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh level"
              >
                <RefreshCw
                  className={`w-4 h-4 text-[#a6a6a6] ${levelLoading ? "animate-spin" : ""}`}
                />
              </button>
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

        {/* Assessment History */}
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-inter font-semibold text-white">
              Assessment History
            </h3>
            <button
              onClick={() => {
                // simple refresh
                setHistoryLoading(true);
                assessmentApi
                  .getHistory()
                  .then(setHistory)
                  .catch(() =>
                    setHistoryError("Failed to load assessment history")
                  )
                  .finally(() => setHistoryLoading(false));
              }}
              className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh history"
            >
              <RefreshCw
                className={`w-4 h-4 text-[#a6a6a6] ${historyLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {historyLoading ? (
            <div className="flex items-center gap-2 text-[#a6a6a6]">
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span className="font-inter text-sm">Loading...</span>
            </div>
          ) : historyError ? (
            <p className="text-red-400 font-inter text-sm">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="text-[#a6a6a6] font-inter text-sm">
              No assessments yet. Take a placement test to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {history.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-[#24262b] rounded-lg p-3 border border-[#3a3a3a]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-md flex items-center justify-center">
                      <Target className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white font-inter text-sm">
                        Level Placed
                      </p>
                      <p className="text-[#a6a6a6] font-inter text-xs">
                        {new Date(item.takenAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-white font-inter font-semibold">
                    HSK {item.levelPlaced}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
