"use client";

import { useRequireAuth } from "@/lib/hooks/use-auth";
import { DashboardLayout } from "@/components/layout";
import { useCurrentLevel } from "@/lib/hooks/use-current-level";
import { useEffect, useMemo, useState } from "react";
import { assessmentApi } from "@/lib/api/assessment";
import { useRouter } from "next/navigation";
import { lessonsApi } from "@/lib/api/lessons";
import {
  listUnits,
  getUnit,
  type CurriculumLesson,
  type CurriculumUnit,
} from "@/lib/api/curriculum";
import {
  BookOpen,
  Brain,
  MessageCircle,
  TrendingUp,
  Clock,
  Target,
  RefreshCw,
  Compass,
} from "lucide-react";

/**
 * Dashboard Page (Protected Route)
 *
 * Main dashboard showing user progress, quick actions, and learning overview.
 */
export default function DashboardPage() {
  const router = useRouter();
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
  const [finishedLessonsCount, setFinishedLessonsCount] = useState(0);
  const [studyStreakDays, setStudyStreakDays] = useState(0);
  const [wordsLearned, setWordsLearned] = useState(0);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(5);
  const [guidedPathLoading, setGuidedPathLoading] = useState(false);
  const [guidedPathError, setGuidedPathError] = useState<string | null>(null);
  const [guidedUnit, setGuidedUnit] = useState<CurriculumUnit | null>(null);
  const [guidedLesson, setGuidedLesson] = useState<CurriculumLesson | null>(
    null
  );

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
    lessonsApi
      .getProgressCount()
      .then((r) => setFinishedLessonsCount(r.finishedCount || 0))
      .catch(() => setFinishedLessonsCount(0));
    lessonsApi
      .getStudyStreak()
      .then((r) => setStudyStreakDays(r.streakDays || 0))
      .catch(() => setStudyStreakDays(0));
    lessonsApi
      .getWordsRead()
      .then((r) => setWordsLearned(r.readCount || 0))
      .catch(() => setWordsLearned(0));
    const loadGuidedPath = async () => {
      setGuidedPathLoading(true);
      setGuidedPathError(null);
      try {
        const units = await listUnits();
        if (!Array.isArray(units) || units.length === 0) {
          if (isMounted) {
            setGuidedUnit(null);
            setGuidedLesson(null);
          }
          return;
        }
        const targetUnit =
          units.find((u) => u.completedLessons < u.totalLessons) ?? units[0];
        const unitDetail = await getUnit(targetUnit.id);
        const nextLesson = unitDetail.lessons.find((l) => !l.completed);
        if (isMounted) {
          setGuidedUnit(targetUnit);
          setGuidedLesson(nextLesson ?? unitDetail.lessons[0] ?? null);
        }
      } catch (error) {
        if (isMounted) {
          setGuidedUnit(null);
          setGuidedLesson(null);
          setGuidedPathError(
            error instanceof Error
              ? error.message
              : "Unable to load guided path"
          );
        }
      } finally {
        if (isMounted) {
          setGuidedPathLoading(false);
        }
      }
    };
    void loadGuidedPath();
    return () => {
      isMounted = false;
    };
  }, []);

  const curriculumProgress = useMemo(() => {
    if (!guidedUnit) return null;
    const completed = guidedUnit.completedLessons;
    const total = guidedUnit.totalLessons || 1;
    return {
      completed,
      total,
      percent: Math.min(100, Math.round((completed / total) * 100)),
    };
  }, [guidedUnit]);

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

        {/* Guided Path Widget */}
        <section className="bg-[#2e323a] rounded-2xl border border-white/10 p-6 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30">
                <Compass className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-inter font-semibold text-white">
                  Guided Path
                </h3>
                <p className="text-sm text-amber-300 font-inter">
                  Follow the structured curriculum sourced from Modern Mandarin
                  Chinese Grammar.
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push("/curriculum")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors duration-200"
            >
              View curriculum
            </button>
          </div>

          <div className="mt-5">
            {guidedPathLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="h-16 bg-[#16181d] border border-white/10 rounded-xl animate-pulse" />
                <div className="h-16 bg-[#16181d] border border-white/10 rounded-xl animate-pulse" />
              </div>
            ) : guidedPathError ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {guidedPathError}
              </div>
            ) : guidedUnit && guidedLesson ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#16181d] p-4">
                  <h4 className="text-sm font-inter text-amber-300">Next up</h4>
                  <p className="text-white text-xl font-inter font-semibold mt-1">
                    {guidedUnit.title}
                  </p>
                  {guidedLesson.description &&
                    guidedLesson.description !== guidedLesson.title && (
                      <p className="text-sm text-white/70 font-inter mt-2 line-clamp-2">
                        {guidedLesson.description}
                      </p>
                    )}
                </div>
                <div className="rounded-xl border border-white/10 bg-[#16181d] p-4">
                  <h4 className="text-sm font-inter text-green-300">
                    Progress
                  </h4>
                  <div
                    className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden"
                    aria-label="Curriculum progress"
                  >
                    <div
                      className="h-full bg-gradient-to-r from-[#20c997] to-[#38ef7d] transition-all duration-500"
                      style={{ width: `${curriculumProgress?.percent ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-white/60 font-inter">
                    <span>
                      {curriculumProgress?.completed ?? 0} /{" "}
                      {curriculumProgress?.total ?? 0} lessons
                    </span>
                    <span>{curriculumProgress?.percent ?? 0}%</span>
                  </div>
                  <button
                    onClick={() =>
                      router.push(
                        `/curriculum/${guidedUnit.id}/${guidedLesson.id}`
                      )
                    }
                    className="mt-4 inline-flex items-center justify-center rounded-full px-4 py-2 border border-green-500/30 bg-green-500/10 text-green-300 text-sm hover:bg-green-500/20 transition-colors duration-200"
                  >
                    Resume lesson
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-[#16181d] p-4">
                <p className="text-sm text-white/70">
                  Curriculum coming soon. Check back after units are seeded.
                </p>
              </div>
            )}
          </div>
        </section>

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
                  ) : formatLevel() ? (
                    <span
                      className={`inline-flex items-center rounded-full text-xl ${getLevelColor()}`}
                    >
                      {formatLevel()}
                    </span>
                  ) : (
                    <p className="text-xl font-inter font-semibold">—</p>
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
                <p className="text-[#a6a6a6] text-sm font-inter">Words Read</p>
                <p
                  className="text-white text-xl font-inter font-semibold"
                  aria-live="polite"
                >
                  {wordsLearned}
                </p>
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
                <p
                  className="text-white text-xl font-inter font-semibold"
                  aria-live="polite"
                >
                  {studyStreakDays} {studyStreakDays === 1 ? "day" : "days"}
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
            <div
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-[#4040f2] transition-all duration-200 cursor-pointer group"
              onClick={() => router.push("/assessment")}
            >
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

            {/* AI Lessons - Enabled with orange accents */}
            <div
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-orange-500/60 transition-all duration-200 cursor-pointer"
              onClick={() => router.push("/lessons")}
            >
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
                <div
                  className="inline-flex items-center gap-2"
                  aria-live="polite"
                >
                  <span className="text-[#a6a6a6] font-inter text-xs whitespace-nowrap leading-none">
                    Finished lessons:
                  </span>
                  <span
                    className="text-green-400 font-inter font-semibold leading-none text-sm"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {finishedLessonsCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Flashcards - Enabled with green accents */}
            <div
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-green-500/60 transition-all duration-200 cursor-pointer"
              onClick={() => router.push("/flashcards")}
            >
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
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-xs text-green-400 font-inter">
                    Available
                  </span>
                </div>
              </div>
            </div>

            {/* Conversation - enabled */}
            <div
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] relative hover:border-purple-500/60 transition-all duration-200 cursor-pointer"
              onClick={() => router.push("/conversations")}
            >
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
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-xs text-green-400 font-inter">
                    Available
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
              <p className="text-[#ffffff] font-inter">
                Take your placement test to determine your current level
              </p>
            </div>
            <div
              className={`flex items-center gap-3 ${history.length > 0 ? "" : "opacity-60"}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${history.length > 0 ? "bg-orange-500/80" : "bg-[#404040]"}`}
              >
                <span
                  className={`text-xs font-bold ${history.length > 0 ? "text-white" : "text-[#999999]"}`}
                >
                  2
                </span>
              </div>
              <p
                className={`${history.length > 0 ? "text-white" : "text-[#999999]"} font-inter`}
              >
                Start with AI-generated lessons tailored to your level
              </p>
            </div>
            <div
              className={`flex items-center gap-3 ${finishedLessonsCount > 0 ? "" : "opacity-60"}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${finishedLessonsCount > 0 ? "bg-green-500" : "bg-[#404040]"}`}
              >
                <span
                  className={`text-xs font-bold ${finishedLessonsCount > 0 ? "text-white" : "text-[#999999]"}`}
                >
                  3
                </span>
              </div>
              <p
                className={`${finishedLessonsCount > 0 ? "text-white" : "text-[#999999]"} font-inter`}
              >
                Mark lessons as finished, then practice with flashcards and
                conversation AI
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
              {history.slice(0, visibleHistoryCount).map((item) => (
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

              {/* Progressive disclosure controls */}
              {history.length > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-[#a6a6a6] font-inter">
                    Showing {Math.min(visibleHistoryCount, history.length)} of{" "}
                    {history.length}
                  </span>
                  <div className="flex items-center gap-2">
                    {visibleHistoryCount > 5 && (
                      <button
                        onClick={() => setVisibleHistoryCount(5)}
                        className="px-3 py-1.5 text-xs bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#6b7280] transition-colors duration-200 cursor-pointer"
                      >
                        Show less
                      </button>
                    )}
                    {visibleHistoryCount < history.length && (
                      <button
                        onClick={() =>
                          setVisibleHistoryCount((c) =>
                            Math.min(c + 5, history.length)
                          )
                        }
                        className="px-3 py-1.5 text-xs bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#6b7280] transition-colors duration-200 cursor-pointer"
                      >
                        Show more
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
