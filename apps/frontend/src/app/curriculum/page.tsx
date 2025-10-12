"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  listUnits,
  listSources,
  type CurriculumUnit,
  type CurriculumSource,
} from "@/lib/api/curriculum";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import {
  Compass,
  CheckCircle2,
  BookOpen,
  Layers,
  Loader2,
  Rocket,
} from "lucide-react";

type FilterValue = "all" | "incomplete" | "completed";

type UnitsResponse = CurriculumUnit[];

export default function CurriculumUnitsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const [units, setUnits] = useState<UnitsResponse>([]);
  const [sources, setSources] = useState<CurriculumSource[]>([]);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    null
  );
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [srcs] = await Promise.all([listSources()]);
        if (!mounted) return;
        setSources(Array.isArray(srcs) ? srcs : []);
        // Initialize from URL param ?source=key
        const sp = new URLSearchParams(window.location.search);
        const urlSource = sp.get("source");
        const defaultKey = urlSource || srcs?.[0]?.key || null;
        const defaultId =
          srcs?.find((s) => s.key === defaultKey)?.id ?? srcs?.[0]?.id ?? null;
        setSelectedSourceKey(defaultKey);
        setSelectedSourceId(typeof defaultId === "number" ? defaultId : null);
        const unitsData = await listUnits(
          defaultKey && defaultId != null
            ? { source: defaultKey, sourceId: defaultId }
            : undefined
        );
        if (!mounted) return;
        setUnits(Array.isArray(unitsData) ? unitsData : []);
      } catch (e) {
        if (!mounted) return;
        const msg =
          e instanceof Error ? e.message : "Failed to load curriculum";
        setError(msg);
        setUnits([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void fetchData();
    return () => {
      mounted = false;
    };
  }, []);
  // When source changes, reload units and sync URL
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!selectedSourceKey) return;
      setLoading(true);
      setError(null);
      try {
        const data = await listUnits({
          source: selectedSourceKey,
          sourceId: selectedSourceId ?? undefined,
        });
        if (!mounted) return;
        setUnits(Array.isArray(data) ? data : []);
        const url = new URL(window.location.href);
        url.searchParams.set("source", selectedSourceKey);
        window.history.replaceState({}, "", url.toString());
      } catch (e) {
        if (!mounted) return;
        const msg =
          e instanceof Error ? e.message : "Failed to load curriculum";
        setError(msg);
        setUnits([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedSourceKey, selectedSourceId]);

  const totals = useMemo(() => {
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
  }, [units]);

  const nextUnit = useMemo(() => {
    if (units.length === 0) return null;
    return (
      units.find(
        (unit) =>
          (unit.completedLessons ?? 0) < Math.max(1, unit.totalLessons ?? 0)
      ) ?? units[0]
    );
  }, [units]);

  const filteredUnits = useMemo(() => {
    switch (filter) {
      case "completed":
        return units.filter(
          (unit) =>
            (unit.totalLessons ?? 0) > 0 &&
            (unit.completedLessons ?? 0) >= (unit.totalLessons ?? 0)
        );
      case "incomplete":
        return units.filter(
          (unit) =>
            (unit.completedLessons ?? 0) < Math.max(1, unit.totalLessons ?? 0)
        );
      default:
        return units;
    }
  }, [filter, units]);

  const filters: Array<{ value: FilterValue; label: string; count: number }> =
    useMemo(
      () => [
        { value: "all", label: "All", count: units.length },
        {
          value: "incomplete",
          label: "In progress",
          count: units.filter(
            (unit) =>
              (unit.completedLessons ?? 0) < Math.max(1, unit.totalLessons ?? 0)
          ).length,
        },
        {
          value: "completed",
          label: "Completed",
          count: units.filter(
            (unit) =>
              (unit.totalLessons ?? 0) > 0 &&
              (unit.completedLessons ?? 0) >= (unit.totalLessons ?? 0)
          ).length,
        },
      ],
      [units]
    );

  const renderUnitCard = (unit: CurriculumUnit) => {
    const total = unit.totalLessons ?? 0;
    const done = unit.completedLessons ?? 0;
    const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;

    // Determine unit status
    const isCompleted = done >= total && total > 0;
    const isInProgress = done > 0 && done < total;

    unit.description = unit.description?.replace(
      /(Chapter\s*\d+:)\s*\d+\s*/,
      "$1 "
    );
    unit.title = unit.title.replace(/^(\d+)(?!\.)\s+/, "$1. ");

    // Status-based styling
    const getCardClasses = () => {
      if (isCompleted) {
        return "group relative flex flex-col rounded-2xl border border-green-500/50 bg-gradient-to-br from-green-900/20 to-green-800/10 p-5 transition-all duration-200 hover:border-green-500/70 hover:from-green-900/30 hover:to-green-800/20 shadow-lg ring-1 ring-green-500/30";
      } else if (isInProgress) {
        return "group relative flex flex-col rounded-2xl border border-amber-500/50 bg-gradient-to-br from-amber-900/20 to-amber-800/10 p-5 transition-all duration-200 hover:border-amber-500/70 hover:from-amber-900/30 hover:to-amber-800/20 shadow-lg ring-1 ring-amber-500/30";
      } else {
        return "group relative flex flex-col rounded-2xl border border-white/10 bg-[#2e323a] p-5 transition-colors duration-200 hover:border-[#4040f2] shadow-md";
      }
    };

    const getIconContainerClasses = () => {
      if (isCompleted) {
        return "flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/15";
      } else if (isInProgress) {
        return "flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 animate-pulse";
      } else {
        return "flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5";
      }
    };

    const getIconClasses = () => {
      if (isCompleted) {
        return "h-5 w-5 text-green-400";
      } else if (isInProgress) {
        return "h-5 w-5 text-amber-400";
      } else {
        return "h-5 w-5 text-white/70";
      }
    };

    const getProgressBarClasses = () => {
      if (isCompleted) {
        return "h-full rounded-full bg-gradient-to-r from-[#20c997] to-[#38ef7d] transition-all duration-300";
      } else if (isInProgress) {
        return "h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] transition-all duration-300";
      } else {
        return "h-full rounded-full bg-gradient-to-r from-[#4040f2] to-[#7c80ff] transition-all duration-300";
      }
    };

    const getIconComponent = () => {
      if (isCompleted) {
        return <CheckCircle2 className={getIconClasses()} />;
      } else if (isInProgress) {
        return <Rocket className={getIconClasses()} />;
      } else {
        return <BookOpen className={getIconClasses()} />;
      }
    };

    return (
      <Link
        key={unit.id}
        href={`/curriculum/${unit.id}`}
        className={getCardClasses()}
        aria-label={`${unit.title} - ${isCompleted ? "Completed" : isInProgress ? "In progress" : "Not started"}`}
      >
        {/* Celebratory shine effect for completed units */}
        {isCompleted && (
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-pulse" />
        )}

        <div className="flex items-start gap-3 relative z-10">
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-lg font-inter font-semibold text-white group-hover:text-white/90 leading-tight">
              {(() => {
                const match = unit.title.match(/^(\d+)\.?\s*(.*)$/);
                if (match) {
                  const [, number, rest] = match;
                  return (
                    <>
                      <span className="text-3xl font-bold text-white/90">
                        {number}{" "}
                      </span>
                      <span>{rest}</span>
                    </>
                  );
                }
                return unit.title;
              })()}
            </h3>
          </div>
          <div className={`flex-shrink-0 ${getIconContainerClasses()}`}>
            {getIconComponent()}
          </div>
        </div>
        <div className="mt-5 space-y-2 relative z-10">
          <div className="flex items-center justify-between text-xs font-inter text-white/60">
            <span aria-label="Lessons completed">
              {done} / {total} lessons
            </span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div
              className={getProgressBarClasses()}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {/* Remove the old completed badge since the entire card is now distinctly styled */}
      </Link>
    );
  };

  if (authLoading) {
    return (
      <DashboardLayout title="Curriculum" subtitle="Structured guided path">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/70" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Curriculum"
      subtitle="Follow the Modern Mandarin Chinese Grammar pathway, lesson by lesson."
    >
      <div className="p-6 space-y-8">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-inter text-red-200">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#2e323a] p-5 shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30">
                <Compass className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-inter text-amber-300">Next step</p>
                <p className="text-base font-inter font-semibold text-white">
                  {nextUnit ? nextUnit.title : "Curriculum coming soon"}
                </p>
              </div>
            </div>
            {nextUnit && (
              <Link
                href={`/curriculum/${nextUnit.id}`}
                aria-label={`Go to curriculum unit ${nextUnit.title}`}
                className="mt-4 inline-flex items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-inter text-amber-300 transition-colors duration-200 hover:bg-amber-500/20"
              >
                Go to unit
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#2e323a] p-5 shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/15 border border-green-500/30">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-inter text-green-300">
                  Overall progress
                </p>
                <p className="text-lg font-inter font-semibold text-white">
                  {totals.percent}% complete
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#20c997] to-[#38ef7d] transition-all duration-500"
                style={{ width: `${totals.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-inter text-white/60">
              {totals.completedLessons} of {totals.totalLessons} lessons
              finished
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#2e323a] p-5 shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-500/30">
                <Layers className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-inter text-purple-300">
                  Units available
                </p>
                <p className="text-lg font-inter font-semibold text-white">
                  {units.length}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs font-inter text-white/60">
              Filter by status to focus on what matters next.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          {/* Source selector */}
          <div className="flex flex-wrap items-center gap-2">
            {sources.map((s) => {
              const active = selectedSourceKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSelectedSourceKey(s.key);
                    setSelectedSourceId(s.id);
                  }}
                  className={
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-inter transition-colors duration-200" +
                    (active
                      ? " border-white bg-white text-black"
                      : " border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
                  }
                  aria-pressed={active}
                  aria-label={`Select source ${s.title}`}
                >
                  <span>{s.title}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-inter font-semibold text-white">
              Units
            </h2>
            <div className="flex flex-wrap gap-2">
              {filters.map(({ value, label, count }) => {
                const isActive = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-inter transition-colors duration-200 cursor-pointer" +
                      (isActive
                        ? " border-white bg-white text-black"
                        : " border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
                    }
                    aria-pressed={isActive}
                  >
                    <span>{label}</span>
                    <span className="">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 rounded-2xl border border-white/10 bg-[#16181d] animate-pulse"
                />
              ))}
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#16181d] p-6 text-center text-white/70">
              {units.length === 0
                ? "No units available for this source."
                : "No units match this filter."}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredUnits.map(renderUnitCard)}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
