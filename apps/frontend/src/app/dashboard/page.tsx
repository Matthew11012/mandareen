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
  serverGetFlashcardsSummary,
  type ServerCurriculumLesson,
  type ServerCurriculumUnit,
} from "@/lib/server/api";
import AssessmentHistory from "@/components/dashboard/AssessmentHistory";
import CountUp from "@/components/ui/CountUp";
import {
  Lightbulb,
  BookOpen,
  Brain,
  MessageCircle,
  Target,
  Flame,
  TrendingUp,
  Calendar,
  Check,
  Play,
  ArrowRight,
  Trophy,
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
    flashcardsSummary,
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
      username: "Learner",
      createdAt: new Date().toISOString(),
      currentLevel: null,
      weeklyGoalLessons: null,
    })),
    serverGetFlashcardsSummary().catch(() => ({
      total: 0,
      due: 0,
      dueToday: 0,
      notStudied: 0,
      weak: 0,
      partial: 0,
      strong: 0,
    })),
  ]);

  let guidedUnit: ServerCurriculumUnit | null = null;
  let guidedLesson: ServerCurriculumLesson | null = null;
  let curriculumProgress: {
    completed: number;
    total: number;
    percent: number;
  } | null = null;

  const curriculumTotals = (() => {
    const totalLessons = units.reduce(
      (acc, unit) => acc + (unit.totalLessons ?? 0),
      0
    );
    const completedLessons = units.reduce(
      (acc, unit) => acc + (unit.completedLessons ?? 0),
      0
    );
    const percent = totalLessons
      ? Math.min(100, Math.round((completedLessons / totalLessons) * 100))
      : 0;
    return { totalLessons, completedLessons, percent };
  })();

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
      const completed = unitDetail.lessons.filter(
        (l: ServerCurriculumLesson) => l.completed
      ).length;
      const total = unitDetail.lessons.length || 1;
      curriculumProgress = {
        completed: curriculumTotals.completedLessons || completed,
        total: curriculumTotals.totalLessons || total,
        percent: curriculumTotals.percent,
      };
    }
  } catch {
    guidedUnit = null;
    guidedLesson = null;
    // ignore; UI falls back to generic copy below
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Quick Stats Logic
  const displayedLevel = (() => {
    if (currentLevel.currentLevel === null) return "Unranked";
    if (currentLevel.currentLevel === 0) return "Novice";
    return `HSK ${currentLevel.currentLevel}`;
  })();

  const levelColorClass = (() => {
    const lvl = currentLevel.currentLevel;
    if (lvl === null || lvl === 0) return "text-zinc-400";
    if (lvl <= 2) return "text-yellow-400";
    if (lvl <= 4) return "text-emerald-400";
    return "text-blue-400";
  })();

  const displayedStreakDays = streakRes.todayContinued
    ? streakRes.streakDays
    : Math.max(streakRes.carryOverDays, 0);

  const flashcardsDue = Math.max(flashcardsSummary?.due ?? 0, 0);

  return (
    <DashboardLayout
      title="Home"
      subtitle="Track your progress and continue learning"
    >
      <div className="p-4 md:p-6 space-y-8 mx-auto">
        {/* Hero Welcome */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#2e323a] to-[#252830] border border-white/5 p-8 md:p-10 shadow-2xl">
          <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none select-none">
            <span className="text-[12rem] font-serif-zh leading-none text-white">
              学
            </span>
          </div>
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 rounded-full bg-white/5 backdrop-blur-md text-xs font-medium text-zinc-300 border border-white/10">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                {streakRes.todayContinued && (
                  <span className="flex items-center gap-1.5 text-orange-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                    <Flame className="w-3.5 h-3.5 fill-current" /> Streak Active
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-5xl font-bold text-white font-inter tracking-tight mb-2">
                {greeting},{" "}
                <span className="text-blue-400">
                  {userData.username ||
                    userData.email.split("@")[0] ||
                    "Learner"}
                </span>
                .
              </h1>
              <p className="text-zinc-400 max-w-lg text-lg leading-relaxed">
                Consistency is key. You&apos;re building a habit that lasts.
              </p>
            </div>

            {/* Streak Counter Hero */}
            <div className="flex items-center gap-4 bg-[#1a1d23]/50 backdrop-blur-md p-4 pr-6 rounded-2xl border border-white/5 shadow-inner">
              <div
                className={`p-3 rounded-xl ${streakRes.todayContinued ? "bg-orange-500/20 text-orange-500" : "bg-zinc-800 text-zinc-600"}`}
              >
                <Flame
                  className={`w-8 h-8 ${streakRes.todayContinued ? "fill-current animate-pulse" : ""}`}
                />
              </div>
              <div>
                <div className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-0.5">
                  Day Streak
                </div>
                <div className="text-4xl font-black text-white tabular-nums leading-none">
                  <CountUp to={displayedStreakDays} duration={1.5} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Current Objective & Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Next Lesson Card */}
            <section className="relative group rounded-3xl bg-[#2e323a] border border-white/5 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/10 hover:border-white/10">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-50" />

              <div className="p-8 relative z-10">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 ring-4 ring-blue-500/5">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </div>
                    <h3 className="text-sm font-semibold text-blue-300/90 uppercase tracking-wide">
                      Up Next
                    </h3>
                  </div>
                  {curriculumProgress && (
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white tabular-nums">
                        {curriculumProgress.percent}%
                      </div>
                      <div className="text-xs text-zinc-500 font-medium">
                        Curriculum Progress
                      </div>
                    </div>
                  )}
                </div>

                {guidedUnit && guidedLesson ? (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-tight">
                        {guidedUnit.title}
                      </h2>
                      <div className="flex items-center gap-3 text-lg text-zinc-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        <p className="font-medium">{guidedLesson.title}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <Link
                        href={`/curriculum/${guidedUnit.id}/${guidedLesson.id}`}
                        className="group flex items-center gap-3 px-8 py-3.5 bg-white text-black rounded-full font-bold text-base hover:bg-blue-50 hover:text-blue-600 transition-all duration-300"
                      >
                        {curriculumProgress?.percent === 0
                          ? "Start Lesson"
                          : "Continue Lesson"}
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                      <Link
                        href="/curriculum"
                        className="px-6 py-3.5 text-zinc-400 hover:text-white font-medium text-sm transition-colors"
                      >
                        View all units
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center bg-black/20 rounded-2xl border border-dashed border-white/10">
                    <p className="text-zinc-500">
                      No active lessons available right now.
                    </p>
                  </div>
                )}
              </div>

              {/* Progress Bar Bottom */}
              {curriculumProgress && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                  <div
                    className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${curriculumProgress.percent}%` }}
                  />
                </div>
              )}
            </section>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-[#2e323a] border border-white/5 rounded-2xl p-5 hover:bg-[#353941] transition-colors">
                <div className="flex items-center gap-3 mb-3 text-zinc-400">
                  <Target className="w-4 h-4" />
                  <span className="text-xs font-mono uppercase">Level</span>
                </div>
                <div className={`text-2xl font-bold ${levelColorClass}`}>
                  {displayedLevel}
                </div>
              </div>

              <div className="bg-[#2e323a] border border-white/5 rounded-2xl p-5 hover:bg-[#353941] transition-colors">
                <div className="flex items-center gap-3 mb-3 text-zinc-400">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-mono uppercase">Vocab</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  <CountUp
                    to={wordsRead.readCount}
                    separator=","
                    duration={1}
                  />
                </div>
              </div>

              <div className="col-span-2 md:col-span-1 bg-[#2e323a] border border-white/5 rounded-2xl p-5 hover:bg-[#353941] transition-colors">
                <div className="flex items-center justify-between mb-3 text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-mono uppercase">Weekly</span>
                  </div>
                  <span className="text-xs">
                    {weeklyProgress.weeklyCount}/
                    {userData.weeklyGoalLessons || 0}
                  </span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-2 mb-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.min(100, (weeklyProgress.weeklyCount / (userData.weeklyGoalLessons || 1)) * 100)}%`,
                    }}
                  />
                </div>
                <Link
                  href="/profile#weekly-goal"
                  className="text-[10px] text-zinc-500 hover:text-white transition-colors"
                >
                  Adjust Goal →
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Quick Access */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest px-1">
              Study Tools
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <Link
                href="/assessment"
                className="group relative overflow-hidden rounded-2xl bg-[#2e323a] border border-white/5 p-1 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center p-4 gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white group-hover:border-transparent transition-all duration-300">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white truncate">
                      Placement Test
                    </h4>
                    <p className="text-xs text-zinc-400 truncate">
                      Check your current level
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors -translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0" />
                </div>
              </Link>

              <Link
                href="/lessons"
                className="group relative overflow-hidden rounded-2xl bg-[#2e323a] border border-white/5 p-1 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center p-4 gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-500/20 flex items-center justify-center text-orange-400 group-hover:bg-orange-500 group-hover:text-white group-hover:border-transparent transition-all duration-300">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white truncate">
                      AI Lessons
                    </h4>
                    <p className="text-xs text-zinc-400 truncate">
                      Personalized learning
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 mr-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-black/30 px-2 py-1 rounded text-orange-200/70 border border-orange-500/10">
                      {lessonsCount.finishedCount} done
                    </span>
                  </div>
                </div>
              </Link>

              <Link
                href="/flashcards"
                className="group relative overflow-hidden rounded-2xl bg-[#2e323a] border border-white/5 p-1 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center p-4 gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white group-hover:border-transparent transition-all duration-300">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white truncate">
                      Flashcards
                    </h4>
                    <p className="text-xs text-zinc-400 truncate">
                      Review vocabulary
                    </p>
                  </div>
                  {flashcardsDue > 0 && (
                    <div className="hidden sm:flex items-center gap-2 mr-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-black/30 text-emerald-200/70 px-2 py-1 rounded border border-emerald-500/10 whitespace-nowrap">
                        {flashcardsDue} due
                      </span>
                    </div>
                  )}
                </div>
              </Link>

              <Link
                href="/conversations"
                className="group relative overflow-hidden rounded-2xl bg-[#2e323a] border border-white/5 p-1 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center p-4 gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white group-hover:border-transparent transition-all duration-300">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white truncate">
                      Conversation
                    </h4>
                    <p className="text-xs text-zinc-400 truncate">
                      Practice speaking
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Pro Tip - Styled as a sticky note or data card */}
            {history.length > 0 && lessonsCount.finishedCount === 0 && (
              <div className="mt-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-5 relative overflow-hidden">
                <Lightbulb className="absolute -right-4 -bottom-4 w-24 h-24 text-amber-500/10 rotate-12" />
                <h4 className="text-amber-400 font-bold flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 fill-current" /> Tip
                </h4>
                <p className="text-sm text-amber-200/80 relative z-10 leading-relaxed">
                  Start with AI Lessons to build your foundation, then practice
                  with flashcards to reinforce what you&apos;ve learned.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Getting Started & History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#2e323a] rounded-3xl p-6 md:p-8 border border-white/5">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <span className="w-2 h-6 bg-blue-500 rounded-full" />
              Getting Started
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-black/20 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-[0_0_10px_rgba(59,130,246,0.4)]">
                  <Check className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">Placement Test</p>
                  <p className="text-xs text-zinc-500">
                    Determine your baseline
                  </p>
                </div>
              </div>
              <div
                className={`flex items-center gap-4 p-4 rounded-xl bg-black/20 border border-white/5 ${history.length > 0 ? "opacity-100" : "opacity-50 grayscale"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${history.length > 0 ? "bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.4)]" : "bg-white/10 text-white/50"}`}
                >
                  {history.length > 0 ? <Check className="w-4 h-4" /> : "2"}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">
                    Complete First Lesson
                  </p>
                  <p className="text-xs text-zinc-500">Start learning</p>
                </div>
              </div>
              <div
                className={`flex items-center gap-4 p-4 rounded-xl bg-black/20 border border-white/5 ${lessonsCount.finishedCount > 0 ? "opacity-100" : "opacity-50 grayscale"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${lessonsCount.finishedCount > 0 ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "bg-white/10 text-white/50"}`}
                >
                  {lessonsCount.finishedCount > 0 ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    "3"
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">Practice Session</p>
                  <p className="text-xs text-zinc-500">
                    Review what you learned
                  </p>
                </div>
              </div>
            </div>
          </div>

          <AssessmentHistory initialHistory={history} />
        </div>
      </div>
    </DashboardLayout>
  );
}
