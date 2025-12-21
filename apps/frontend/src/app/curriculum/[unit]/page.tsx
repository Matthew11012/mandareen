"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getUnit,
  getUnitNavigation,
  type CurriculumLesson,
  type CurriculumAccess,
} from "@/lib/api/curriculum";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import {
  Loader2,
  BookMarked,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Lock,
  Play,
  RotateCcw,
  Rocket,
} from "lucide-react";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type UnitDetailResponse = Awaited<ReturnType<typeof getUnit>> | null;

type LessonStatus = "completed" | "available" | "pending";

type LessonWithStatus = CurriculumLesson & {
  status: LessonStatus;
  percentCompleted: number;
  latestQuizScore?: number | null;
};

type Params = { unit: string };

export default function UnitDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { unit } = React.use(params);
  const unitId = Number(unit);
  const { isLoading: authLoading } = useRequireAuth();
  const [unitData, setUnitData] = useState<UnitDetailResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<{
    previous: {
      id: number;
      title: string;
      order: number;
    } | null;
    next: {
      id: number;
      title: string;
      order: number;
    } | null;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchUnit = async () => {
      setLoading(true);
      setError(null);
      try {
        const [data, navData] = await Promise.all([
          getUnit(unitId),
          getUnitNavigation(unitId),
        ]);
        if (!mounted) return;
        setUnitData(data ?? null);
        setNavigation(navData);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : "Failed to load unit";
        setError(msg);
        setUnitData(null);
        setNavigation(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void fetchUnit();
    return () => {
      mounted = false;
    };
  }, [unitId]);

  const enrichedLessons: LessonWithStatus[] = useMemo(() => {
    if (!unitData?.lessons) return [];
    return unitData.lessons.map((lesson) => {
      const status: LessonStatus = lesson.completed ? "completed" : "available";
      return {
        ...lesson,
        status,
        percentCompleted: lesson.completed ? 100 : 0,
        latestQuizScore: lesson.latestQuizScore,
      };
    });
  }, [unitData?.lessons]);

  const completedCount = useMemo(
    () => enrichedLessons.filter((lesson) => lesson.completed).length,
    [enrichedLessons]
  );

  if (authLoading) {
    return (
      <DashboardLayout title="Curriculum" subtitle="Loading unit details…">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/70" />
        </div>
      </DashboardLayout>
    );
  }

  const unitAccess = (unitData?.access ?? "full") as CurriculumAccess;
  const isPreviewUnit = unitAccess === "preview";

  const renderLessonRow = (lesson: LessonWithStatus) => {
    const isCompleted = lesson.status === "completed";
    const lessonAccess = (lesson.access ?? unitAccess) as CurriculumAccess;
    const isLocked = lessonAccess === "preview";

    const getCardClasses = () => {
      const baseClasses =
        "group relative flex flex-col md:flex-row md:items-center justify-between gap-6 rounded-3xl p-6 transition-all duration-500 overflow-hidden";

      if (isCompleted) {
        return `${baseClasses} border border-green-500/20 bg-[#1a1d23] hover:border-green-500/40 shadow-lg`;
      } else if (isLocked) {
        return `${baseClasses} border border-white/5 bg-[#1a1d23]/50 grayscale cursor-not-allowed`;
      } else {
        return `${baseClasses} border border-white/10 bg-[#1a1d23] hover:border-[#4040f2]/40 hover:bg-[#1c1f26] shadow-xl`;
      }
    };

    const cardContent = (
      <>
        {/* Background Accent */}
        <div
          className={cn(
            "absolute -left-12 -top-12 h-32 w-32 rounded-full blur-[48px] transition-opacity duration-500 opacity-10",
            isCompleted
              ? "bg-green-500"
              : isLocked
                ? "bg-amber-500"
                : "bg-[#4040f2]"
          )}
        />

        <div className="relative z-10 flex flex-1 items-start gap-5">
          {/* Lesson Number Circle */}
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border font-inter font-black text-xl transition-all duration-500 shadow-inner",
              isCompleted
                ? "bg-green-500/10 border-green-500/20 text-green-400"
                : isLocked
                  ? "bg-white/5 border-white/10 text-[#666666]"
                  : "bg-white/5 border-white/10 text-white group-hover:border-[#4040f2]/40 group-hover:text-[#4040f2]"
            )}
          >
            {(() => {
              const match = lesson.title.match(/^(\d+\.?\d*)\s/);
              return match ? match[1] : "?";
            })()}
          </div>

          <div className="min-w-0 space-y-1.5 pt-1">
            <h3
              className={cn(
                "text-lg font-inter font-bold transition-colors duration-300",
                isCompleted
                  ? "text-white/90"
                  : isLocked
                    ? "text-[#a6a6a6]"
                    : "text-white group-hover:text-[#4040f2]"
              )}
            >
              {lesson.title.replace(/^(\d+\.?\d*)\s/, "")}
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              {isCompleted ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-green-500/10 border border-green-500/20 px-2 py-1 text-[10px] font-black uppercase tracking-tighter text-green-400">
                    <CheckCircle2 className="h-3 w-3" /> COMPLETED
                  </span>
                  {typeof lesson.latestQuizScore === "number" && (
                    <span className="text-xs font-inter font-bold text-green-500/60">
                      Score: {lesson.latestQuizScore}%
                    </span>
                  )}
                </div>
              ) : isLocked ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[10px] font-black uppercase tracking-tighter text-amber-500/80">
                  <Lock className="h-3 w-3" /> LOCKED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2 py-1 text-[10px] font-black uppercase tracking-tighter text-blue-400">
                  <Play className="h-3 w-3" /> AVAILABLE
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col md:items-end gap-3 shrink-0">
          {!isLocked ? (
            <div
              className={cn(
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-inter font-bold transition-all duration-300",
                isCompleted
                  ? "bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20"
                  : "bg-[#4040f2] text-white shadow-[0_4px_16px_rgba(64,64,242,0.3)] hover:bg-[#3636d9] hover:scale-[1.05] active:scale-95"
              )}
            >
              {isCompleted ? (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Review
                </>
              ) : (
                <>
                  Start Lesson
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </div>
          ) : (
            <div className="text-xs font-inter font-bold text-amber-500/60 uppercase tracking-widest text-right">
              Upgrade to Unlock
            </div>
          )}
        </div>
      </>
    );

    if (isLocked) {
      return (
        <motion.div
          key={lesson.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={getCardClasses()}
        >
          {cardContent}
        </motion.div>
      );
    }

    return (
      <motion.div
        key={lesson.id}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ x: 4 }}
      >
        <Link
          href={`/curriculum/${unitId}/${lesson.id}`}
          className={getCardClasses()}
          aria-label={`${lesson.title} - ${isCompleted ? "Completed" : "Start Lesson"}`}
        >
          {cardContent}
        </Link>
      </motion.div>
    );
  };

  const renderAccessBanner = () => {
    if (!isPreviewUnit) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 shadow-xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Lock className="h-12 w-12 text-amber-500" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-inter font-black text-amber-400 uppercase tracking-widest">
              Premium Content
            </h3>
            <p className="text-[#a6a6a6] text-sm leading-relaxed max-w-2xl">
              You&apos;re currently viewing a{" "}
              <span className="text-amber-200 font-bold">preview</span> unit.
              Unlock the full potential of your Mandarin journey with unlimited
              access to all 64+ grammar units.
            </p>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-8 py-3.5 text-sm font-inter font-black text-black shadow-lg hover:bg-amber-400 transition-all hover:scale-[1.05] active:scale-95"
          >
            Upgrade Now
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    );
  };

  return (
    <DashboardLayout
      title={unitData?.title ?? "Unit"}
      subtitle="Progress through each subchapter step by step"
    >
      <div className="p-6 space-y-6">
        <nav
          className="text-xs font-inter text-white/60"
          aria-label="Breadcrumb"
        >
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/curriculum" className="hover:text-white">
                Curriculum
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li className="text-white/80">{unitData?.title ?? "Unit"}</li>
          </ol>
        </nav>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-inter text-red-200">
            {error}
          </div>
        )}

        {renderAccessBanner()}

        <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-[#1a1d23] p-8 shadow-2xl group"
          >
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-500/5 blur-[80px] group-hover:bg-amber-500/10 transition-colors duration-500" />

            <div className="relative z-10 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400">
                <Rocket className="h-3.5 w-3.5" /> Unit Detailed View
              </div>

              <h2 className="text-3xl font-inter font-black text-white leading-tight">
                {(() => {
                  const title = unitData?.title ?? "Unit";
                  const match = title.match(/^(\d+)\s+(.+)$/);
                  if (match) {
                    const [, number, rest] = match;
                    return (
                      <div className="flex flex-col">
                        <span className="text-amber-500/40 text-sm font-black mb-1">
                          UNIT {number}
                        </span>
                        <span>{rest}</span>
                      </div>
                    );
                  }
                  return title;
                })()}
              </h2>

              {unitData?.description &&
                !/^Chapter\s*\d+:/i.test(unitData.description) && (
                  <p className="text-base font-inter text-[#a6a6a6] leading-relaxed max-w-xl">
                    {unitData.description}
                  </p>
                )}

              <div className="pt-4 flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs font-inter font-bold text-white shadow-inner">
                  <BookMarked className="h-4 w-4 text-amber-400" />
                  {enrichedLessons.length} Lessons
                </div>
                {completedCount > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-2 text-xs font-inter font-bold text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {completedCount} Completed
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl border border-white/10 bg-[#1a1d23] p-8 shadow-2xl flex flex-col justify-between"
          >
            <div className="space-y-2">
              <p className="text-xs font-inter font-black uppercase tracking-widest text-[#666666]">
                Unit Mastery
              </p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-inter font-black text-white">
                  {enrichedLessons.length > 0
                    ? Math.round(
                        (completedCount / enrichedLessons.length) * 100
                      )
                    : 0}
                  %
                </span>
                <span className="text-sm font-inter font-bold text-[#a6a6a6] uppercase">
                  Progress
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-3 w-full rounded-full bg-white/5 border border-white/5 overflow-hidden shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${enrichedLessons.length > 0 ? (completedCount / enrichedLessons.length) * 100 : 0}%`,
                  }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-inter font-bold text-[#666666] uppercase tracking-wider">
                  {completedCount} of {enrichedLessons.length} finished
                </p>
                {completedCount === enrichedLessons.length &&
                  enrichedLessons.length > 0 && (
                    <span className="text-[10px] font-black text-green-400 bg-green-500/10 px-2 py-1 rounded-md uppercase">
                      Unit Mastered
                    </span>
                  )}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-inter font-semibold text-white">
            Lessons
          </h3>
          {loading ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-2xl border border-white/10 bg-[#16181d] animate-pulse"
                />
              ))}
            </div>
          ) : enrichedLessons.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#16181d] p-8 text-center text-sm font-inter text-white/60">
              Lessons for this unit are coming soon.
            </div>
          ) : (
            <div className="grid gap-3">
              {enrichedLessons.map(renderLessonRow)}
            </div>
          )}
        </section>

        {/* Unit Navigation */}
        {navigation && (navigation.previous || navigation.next) && (
          <div className="pt-10">
            <div className="flex flex-col lg:flex-row gap-6">
              {navigation.previous && (
                <Link
                  href={`/curriculum/${navigation.previous.id}`}
                  className="flex-1 min-w-0 group flex items-center gap-6 rounded-3xl border border-white/5 bg-[#1a1d23] p-6 transition-all duration-300 hover:border-white/20 hover:bg-[#1c1f26]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 border border-white/10 transition-transform group-hover:-translate-x-1">
                    <ChevronLeft className="h-6 w-6 text-[#a6a6a6]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-inter font-black text-[#666666] uppercase tracking-widest mb-1">
                      Previous Unit
                    </p>
                    <p className="text-base font-inter font-bold text-white truncate group-hover:text-[#4040f2] transition-colors">
                      {navigation.previous.title}
                    </p>
                  </div>
                </Link>
              )}

              {navigation.next && (
                <Link
                  href={`/curriculum/${navigation.next.id}`}
                  className="flex-1 min-w-0 group flex items-center justify-between gap-6 rounded-3xl border border-white/5 bg-[#1a1d23] p-6 transition-all duration-300 hover:border-white/20 hover:bg-[#1c1f26]"
                >
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[10px] font-inter font-black text-[#666666] uppercase tracking-widest mb-1">
                      Next Unit
                    </p>
                    <p className="text-base font-inter font-bold text-white truncate group-hover:text-[#4040f2] transition-colors">
                      {navigation.next.title}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 border border-white/10 transition-transform group-hover:translate-x-1">
                    <ChevronRight className="h-6 w-6 text-[#a6a6a6]" />
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
