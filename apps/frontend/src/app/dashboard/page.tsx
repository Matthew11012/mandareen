import Link from "next/link";
import { DashboardLayout } from "@/components/layout";
import {
  serverGetAssessmentHistory,
  serverGetLessonsProgressCount,
  serverGetStudyStreak,
  serverGetStudyStreakStatus,
  serverGetWordsRead,
  serverListUnits,
  serverGetUnit,
  serverGetCurrentLevel,
  serverGetWeeklyProgress,
  serverGetMe,
  type ServerCurriculumLesson,
  type ServerCurriculumUnit,
} from "@/lib/server/api";
import GuidedPath from "@/components/dashboard/GuidedPath";
import QuickStats from "@/components/dashboard/QuickStats";
import AssessmentHistory from "@/components/dashboard/AssessmentHistory";
import {
  Lightbulb,
  BookOpen,
  Brain,
  MessageCircle,
  Target,
  Compass,
} from "lucide-react";

export default async function DashboardPage() {
  let offsetMinutes: number | undefined;
  try {
    offsetMinutes = new Date().getTimezoneOffset() * -1;
  } catch {
    offsetMinutes = undefined;
  }

  const [
    history,
    lessonsCount,
    streakRes,
    wordsRead,
    units,
    currentLevel,
    weeklyProgress,
    userData,
  ] = await Promise.all([
    serverGetAssessmentHistory().catch(() => []),
    serverGetLessonsProgressCount().catch(() => ({ finishedCount: 0 })),
    serverGetStudyStreakStatus(offsetMinutes)
      .then((res) => ({
        todayContinued: Boolean(res.todayContinued),
        streakDays: res.streakDays || 0,
        carryOverDays: res.carryOverDays || 0,
      }))
      .catch(async () => {
        const fallback = await serverGetStudyStreak(offsetMinutes).catch(
          () => ({ streakDays: 0 })
        );
        return {
          todayContinued: true,
          streakDays: fallback.streakDays || 0,
          carryOverDays: fallback.streakDays || 0,
        };
      }),
    serverGetWordsRead().catch(() => ({ readCount: 0 })),
    serverListUnits().catch(() => []),
    serverGetCurrentLevel().catch(() => ({ currentLevel: null })),
    serverGetWeeklyProgress(offsetMinutes).catch(() => ({
      weeklyCount: 0,
      weekStartLocalISO: new Date().toISOString(),
      weekEndLocalISO: new Date().toISOString(),
    })),
    serverGetMe().catch(() => ({
      id: 0,
      email: "",
      createdAt: new Date().toISOString(),
      currentLevel: null,
      weeklyGoalLessons: null,
    })),
  ]);

  let guidedUnit: ServerCurriculumUnit | null = null;
  let guidedLesson: ServerCurriculumLesson | null = null;
  let curriculumProgress: {
    completed: number;
    total: number;
    percent: number;
  } | null = null;
  let guidedPathError: string | null = null;

  try {
    if (Array.isArray(units) && units.length > 0) {
      const targetUnit =
        units.find((u) => u.completedLessons < u.totalLessons) ?? units[0];
      const unitDetail = await serverGetUnit(targetUnit.id);
      const nextLesson =
        unitDetail.lessons.find((l: ServerCurriculumLesson) => !l.completed) ??
        unitDetail.lessons[0] ??
        null;
      guidedUnit = targetUnit;
      guidedLesson = nextLesson;
      const completed = targetUnit.completedLessons;
      const total = targetUnit.totalLessons || 1;
      curriculumProgress = {
        completed,
        total,
        percent: Math.min(100, Math.round((completed / total) * 100)),
      };
    }
  } catch (error) {
    guidedUnit = null;
    guidedLesson = null;
    guidedPathError =
      error instanceof Error ? error.message : "Unable to load guided path";
  }

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Welcome back! Ready to continue your Mandarin journey?"
    >
      <div className="p-6 space-y-8">
        <div className="bg-gradient-to-r from-[#4040f2] to-[#6366f1] rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-inter font-bold">
                Welcome to Mandareen! 🎉
              </h2>
              <p className="text-blue-50 font-inter">
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

            <Link
              href="/curriculum"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 hover:border-amber-500/70 transition-colors duration-200 font-medium"
            >
              <Compass className="w-4 h-4" />
              View curriculum
            </Link>
          </div>

          <div className="mt-5">
            {guidedPathError ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {guidedPathError}
              </div>
            ) : guidedUnit && guidedLesson && curriculumProgress ? (
              <GuidedPath
                guidedUnit={guidedUnit}
                guidedLesson={guidedLesson}
                curriculumProgress={curriculumProgress}
              />
            ) : (
              <div className="rounded-xl border border-white/10 bg-[#16181d] p-4">
                <p className="text-sm text-white/70">
                  Curriculum coming soon. Check back after units are seeded.
                </p>
              </div>
            )}
          </div>
        </section>

        {history.length > 0 && lessonsCount.finishedCount === 0 && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-blue-200 mb-1">
                  💡 Pro tip
                </h4>
                <p className="text-sm text-blue-100/90">
                  Start with AI Lessons to build your foundation, then practice
                  with flashcards to reinforce what you&apos;ve learned.
                </p>
              </div>
            </div>
          </div>
        )}

        <QuickStats
          currentLevel={currentLevel.currentLevel}
          wordsLearned={wordsRead.readCount || 0}
          studyStreakDays={streakRes.streakDays || 0}
          streakTodayContinued={Boolean(streakRes.todayContinued)}
          streakCarryOverDays={streakRes.carryOverDays || 0}
          weeklyGoalLessons={userData.weeklyGoalLessons}
          weeklyCount={weeklyProgress.weeklyCount}
        />

        <div className="space-y-4">
          <h3 className="text-xl font-inter font-semibold text-white">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/assessment"
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-[#4040f2] transition-all duration-200 group relative block"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors duration-200">
                  <Target className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    Take Placement Test
                  </h4>
                  <p className="text-sm text-[#c4c4c4] font-inter">
                    Assess your current Mandarin level
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 border border-green-500/30 px-2 py-0.5 text-xs font-inter text-green-300">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  Available
                </span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#4040f2]/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-end justify-center pb-6">
                <span className="px-6 py-2.5 bg-white text-[#4040f2] rounded-lg font-semibold">
                  Start Test
                </span>
              </div>
            </Link>

            <Link
              href="/lessons"
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-orange-500/60 transition-all duration-200 group relative block"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    AI Lessons
                  </h4>
                  <p className="text-sm text-[#c4c4c4] font-inter">
                    Personalized learning content
                  </p>
                </div>
                <div
                  className="inline-flex items-center gap-2"
                  aria-live="polite"
                >
                  <span className="text-[#c4c4c4] font-inter text-xs whitespace-nowrap leading-none">
                    Finished lessons:
                  </span>
                  <span
                    className="text-green-400 font-inter font-semibold leading-none text-sm"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {lessonsCount.finishedCount || 0}
                  </span>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-orange-500/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-end justify-center pb-6">
                <span className="px-6 py-2.5 bg-white text-orange-500 rounded-lg font-semibold">
                  Start Lesson
                </span>
              </div>
            </Link>

            <Link
              href="/flashcards"
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] hover:border-green-500/60 transition-all duration-200 group relative block"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Brain className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    Flashcards
                  </h4>
                  <p className="text-sm text-[#c4c4c4] font-inter">
                    Spaced repetition practice
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 border border-green-500/30 px-2 py-0.5 text-xs font-inter text-green-300">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  Available
                </span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-green-500/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-end justify-center pb-6">
                <span className="px-6 py-2.5 bg-white text-green-500 rounded-lg font-semibold">
                  Start Practice
                </span>
              </div>
            </Link>

            <Link
              href="/conversations"
              className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] relative hover:border-purple-500/60 transition-all duration-200 group block"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h4 className="font-inter font-medium text-white">
                    AI Conversation
                  </h4>
                  <p className="text-sm text-[#c4c4c4] font-inter">
                    Real-time practice sessions
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 border border-green-500/30 px-2 py-0.5 text-xs font-inter text-green-300">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  Available
                </span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-purple-500/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-end justify-center pb-6">
                <span className="px-6 py-2.5 bg-white text-purple-500 rounded-lg font-semibold">
                  Start Chat
                </span>
              </div>
            </Link>
          </div>
        </div>

        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <h3 className="text-lg font-inter font-semibold text-white mb-4">
            Getting Started
          </h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold">1</span>
              <span className="text-sm sm:text-base text-[#ffffff] font-inter">Take your placement test to determine your current level</span>
            </div>
            <div className={`flex items-center space-x-3 sm:space-x-4 ${history.length > 0 ? "" : "opacity-60"}`}>
              <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-sm font-semibold ${history.length > 0 ? "bg-orange-500/80 text-white" : "bg-[#404040] text-[#999999]"}`}>2</span>
              <span className={`${history.length > 0 ? "text-white" : "text-[#999999]"} text-sm sm:text-base font-inter`}>Start with AI-generated lessons tailored to your level</span>
            </div>
            <div className={`flex items-center space-x-3 sm:space-x-4 ${lessonsCount.finishedCount > 0 ? "" : "opacity-60"}`}>
              <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-sm font-semibold ${lessonsCount.finishedCount > 0 ? "bg-green-500 text-white" : "bg-[#404040] text-[#999999]"}`}>3</span>
              <span className={`${lessonsCount.finishedCount > 0 ? "text-white" : "text-[#999999]"} text-sm sm:text-base font-inter`}>Mark lessons as finished, then practice with flashcards and conversation AI</span>
            </div>
          </div>
        </div>

        <AssessmentHistory initialHistory={history} />
      </div>
    </DashboardLayout>
  );
}
