"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getUnit,
  getUnitNavigation,
  type CurriculumLesson,
} from "@/lib/api/curriculum";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import {
  Loader2,
  BookMarked,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import * as React from "react";

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

  const renderLessonRow = (lesson: LessonWithStatus) => {
    const isCompleted = lesson.status === "completed";
    const isAvailable = lesson.status === "available";

    const getCardClasses = () => {
      if (isCompleted) {
        return "flex flex-col gap-4 rounded-2xl border border-green-500/40 bg-gradient-to-br from-green-900/20 to-green-800/10 p-4 transition-all duration-200 hover:border-green-500/60 hover:shadow-xl hover:scale-[1.02] shadow-lg ring-1 ring-green-500/20 hover:from-green-900/30 hover:to-green-800/20";
      } else {
        return "flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#2e323a] p-4 transition-all duration-200 hover:border-[#4040f2] hover:shadow-xl hover:scale-[1.02] shadow-md hover:bg-gradient-to-br hover:from-[#2e323a] hover:to-[#3a3f4a]";
      }
    };

    const getBadge = () => {
      if (isCompleted) {
        return (
          <div className="flex flex-col items-end gap-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-inter text-green-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Done
            </span>
            {typeof lesson.latestQuizScore === "number" && (
              <span className="text-xs font-inter text-green-400 font-semibold">
                Latest: {lesson.latestQuizScore}%
              </span>
            )}
          </div>
        );
      } else if (isAvailable) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-inter text-amber-300">
            <Clock className="h-3.5 w-3.5" /> Available
          </span>
        );
      } else {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs font-inter text-white/80">
            <Clock className="h-3.5 w-3.5" /> Pending
          </span>
        );
      }
    };

    return (
      <Link
        key={lesson.id}
        href={`/curriculum/${unitId}/${lesson.id}`}
        className={`${getCardClasses()} group`}
        aria-label={`${lesson.title} - ${
          isCompleted
            ? `Completed${typeof lesson.latestQuizScore === "number" ? ` with ${lesson.latestQuizScore}% score` : ""}`
            : isAvailable
              ? "Available - Start Lesson"
              : "Pending"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-inter font-semibold text-white leading-tight">
              {(() => {
                const match = lesson.title.match(/^(\d+\.?\d*)\s*(.*)$/);
                if (match) {
                  const [, number, rest] = match;
                  return (
                    <>
                      <span className="text-2xl font-bold text-white mr-2">
                        {number}
                      </span>
                      <span className="text-base">{rest}</span>
                    </>
                  );
                }
                return lesson.title.replace(/^(\d+)\s/, "$1. ");
              })()}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-3">
            {getBadge()}
            {isAvailable && (
              <span className="inline-flex items-center gap-1 text-sm font-inter font-semibold text-white group-hover:text-blue-300 transition-colors duration-200">
                Start Lesson <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>
      </Link>
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

        <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-900/20 to-amber-800/10 p-6 transition-all duration-200 hover:border-amber-500/60 shadow-lg ring-1 ring-amber-500/20">
            <h2 className="text-lg font-inter font-semibold text-white">
              {(() => {
                const title = unitData?.title ?? "Unit";
                const match = title.match(/^(\d+)\s+(.+)$/);
                if (match) {
                  const [, number, rest] = match;
                  return `Unit ${number}: ${rest}`;
                }
                return title;
              })()}
            </h2>
            {unitData?.description &&
              !/^Chapter\s*\d+:/i.test(unitData.description) && (
                <p className="mt-2 text-sm font-inter text-white/60">
                  {unitData.description}
                </p>
              )}
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-inter text-amber-300">
              <BookMarked className="h-4 w-4" /> {enrichedLessons.length}{" "}
              lessons
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#2e323a] p-6 shadow-md">
            <h3 className="text-sm font-inter text-amber-300">Completion</h3>
            <div className="mt-1 flex items-baseline gap-2">
              <p
                className="text-3xl font-inter font-bold text-white"
                aria-label="Completion percentage"
              >
                {enrichedLessons.length > 0
                  ? Math.round((completedCount / enrichedLessons.length) * 100)
                  : 0}
                %
              </p>
              <p className="text-base font-inter text-white/60">
                {completedCount} / {enrichedLessons.length}
              </p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] transition-all duration-500"
                style={{
                  width: `${enrichedLessons.length > 0 ? (completedCount / enrichedLessons.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
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
          <div className="pt-6 border-t border-white/10">
            {/* Desktop: side-by-side */}
            <div className="hidden md:flex items-center justify-between">
              {navigation.previous ? (
                <Link
                  href={`/curriculum/${navigation.previous.id}`}
                  className="inline-flex items-center gap-3 px-5 py-3 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors duration-200"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm text-white/60">Previous Unit</div>
                    <div className="text-base font-medium truncate max-w-[200px]">
                      {navigation.previous.title}
                    </div>
                  </div>
                </Link>
              ) : (
                <div></div>
              )}

              {navigation.next ? (
                <Link
                  href={`/curriculum/${navigation.next.id}`}
                  className="inline-flex items-center gap-3 px-5 py-3 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors duration-200"
                >
                  <div className="text-right">
                    <div className="text-sm text-white/60">Next Unit</div>
                    <div className="text-base font-medium truncate max-w-[200px]">
                      {navigation.next.title}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5" />
                </Link>
              ) : (
                <div></div>
              )}
            </div>

            {/* Mobile: stacked with Next first */}
            <div className="flex flex-col gap-3 md:hidden">
              {navigation.next && (
                <Link
                  href={`/curriculum/${navigation.next.id}`}
                  className="inline-flex items-center justify-between gap-3 px-5 py-3 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors duration-200"
                >
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm text-white/60">Next Unit</div>
                    <div className="text-base font-medium truncate">
                      {navigation.next.title}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 flex-shrink-0" />
                </Link>
              )}

              {navigation.previous && (
                <Link
                  href={`/curriculum/${navigation.previous.id}`}
                  className="inline-flex items-center gap-3 px-5 py-3 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors duration-200"
                >
                  <ChevronLeft className="w-5 h-5 flex-shrink-0" />
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm text-white/60">Previous Unit</div>
                    <div className="text-base font-medium truncate">
                      {navigation.previous.title}
                    </div>
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
