"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getUnit, type CurriculumLesson } from "@/lib/api/curriculum";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { Loader2, BookMarked, CheckCircle2, Clock } from "lucide-react";
import * as React from "react";

type UnitDetailResponse = Awaited<ReturnType<typeof getUnit>> | null;

type LessonStatus = "completed" | "available" | "pending";

type LessonWithStatus = CurriculumLesson & {
  status: LessonStatus;
  percentCompleted: number;
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

  useEffect(() => {
    let mounted = true;
    const fetchUnit = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getUnit(unitId);
        if (!mounted) return;
        setUnitData(data ?? null);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : "Failed to load unit";
        setError(msg);
        setUnitData(null);
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
    const badge =
      lesson.status === "completed" ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-inter text-green-200">
          <CheckCircle2 className="h-3.5 w-3.5" /> Done
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs font-inter text-white/80">
          <Clock className="h-3.5 w-3.5" /> Available
        </span>
      );

    return (
      <Link
        key={lesson.id}
        href={`/curriculum/${unitId}/${lesson.id}`}
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#16181d] p-4 transition-colors duration-200 hover:border-white/20"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-inter font-semibold text-white">
              {lesson.title.replace(/^(\d+)\s/, "$1. ")}
            </h3>
            {lesson.description && (
              <p className="mt-1 text-sm font-inter text-white/60 line-clamp-2">
                {lesson.description}
              </p>
            )}
          </div>
          {badge}
        </div>
        <div className="flex items-center gap-3 text-xs font-inter text-white/50">
          <span>Lesson order {lesson.order}</span>
          <span aria-hidden>•</span>
          <span>ID {lesson.id}</span>
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
              <Link href="/dashboard" className="hover:text-white">
                Dashboard
              </Link>
            </li>
            <li aria-hidden>›</li>
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
          <div className="rounded-2xl border border-white/10 bg-[#16181d] p-6">
            <h2 className="text-lg font-inter font-semibold text-white">
              {unitData?.title ?? "Unit"}
            </h2>
            {unitData?.description && (
              <p className="mt-2 text-sm font-inter text-white/60">
                {unitData.description}
              </p>
            )}
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-inter text-white/70">
              <BookMarked className="h-4 w-4" /> {enrichedLessons.length}{" "}
              lessons
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#16181d] p-6">
            <h3 className="text-sm font-inter text-white/60">Completion</h3>
            <p className="mt-1 text-2xl font-inter font-semibold text-white">
              {completedCount} / {enrichedLessons.length}
            </p>
            <p className="mt-1 text-xs font-inter text-white/50">
              Finish each lesson to unlock the next activities.
            </p>
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
      </div>
    </DashboardLayout>
  );
}
