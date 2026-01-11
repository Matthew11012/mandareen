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
  ChevronUp,
  Lock,
  Search,
  ArrowRight,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("order");
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Show/hide back-to-top button
  useEffect(() => {
    const scrollEl = document.querySelector(
      'main[class*="overflow-y-auto"]'
    ) as HTMLElement | null;

    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const topCandidates = [
          window.scrollY || 0,
          document.documentElement?.scrollTop || 0,
          document.body?.scrollTop || 0,
          scrollEl?.scrollTop || 0,
        ];
        const top = Math.max(...topCandidates);
        setShowScrollTop(top > 800);
        ticking = false;
      });
    };
    scrollEl?.addEventListener("scroll", handler, {
      passive: true,
    } as AddEventListenerOptions);
    window.addEventListener(
      "scroll",
      handler as EventListener,
      {
        passive: true,
      } as AddEventListenerOptions
    );
    document.addEventListener(
      "scroll",
      handler as EventListener,
      {
        passive: true,
        capture: true,
      } as AddEventListenerOptions
    );
    handler();
    return () => {
      scrollEl?.removeEventListener("scroll", handler as EventListener);
      window.removeEventListener("scroll", handler as EventListener);
      document.removeEventListener(
        "scroll",
        handler as EventListener,
        {
          capture: true,
        } as unknown as EventListenerOptions
      );
    };
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initialize from URL params
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlSearch = sp.get("search");
    const urlSort = sp.get("sort");
    if (urlSearch) {
      setSearchQuery(urlSearch);
      setDebouncedSearchQuery(urlSearch);
    }
    if (urlSort) {
      setSortBy(urlSort);
    }
  }, []);

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

  // Update URL when search or sort changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (debouncedSearchQuery.trim()) {
      url.searchParams.set("search", debouncedSearchQuery);
    } else {
      url.searchParams.delete("search");
    }
    if (sortBy !== "order") {
      url.searchParams.set("sort", sortBy);
    } else {
      url.searchParams.delete("sort");
    }
    window.history.replaceState({}, "", url.toString());
  }, [debouncedSearchQuery, sortBy]);

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
    let filtered = units;

    // Apply status filter
    switch (filter) {
      case "completed":
        filtered = units.filter(
          (unit) =>
            (unit.totalLessons ?? 0) > 0 &&
            (unit.completedLessons ?? 0) >= (unit.totalLessons ?? 0)
        );
        break;
      case "incomplete":
        filtered = units.filter((unit) => {
          const total = unit.totalLessons ?? 0;
          const done = unit.completedLessons ?? 0;
          return total > 0 && done > 0 && done < total;
        });
        break;
      default:
        filtered = units;
    }

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((unit) => {
        const title = unit.title.toLowerCase();
        const description = (unit.description || "").toLowerCase();
        return title.includes(query) || description.includes(query);
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "progress-low":
          return (
            (a.completedLessons ?? 0) / Math.max(1, a.totalLessons ?? 0) -
            (b.completedLessons ?? 0) / Math.max(1, b.totalLessons ?? 0)
          );
        case "progress-high":
          return (
            (b.completedLessons ?? 0) / Math.max(1, b.totalLessons ?? 0) -
            (a.completedLessons ?? 0) / Math.max(1, a.totalLessons ?? 0)
          );
        case "title":
          return a.title.localeCompare(b.title);
        case "order":
        default:
          // Extract unit number for natural sorting
          const aNum = parseInt(a.title.match(/^(\d+)/)?.[1] || "0");
          const bNum = parseInt(b.title.match(/^(\d+)/)?.[1] || "0");
          return aNum - bNum;
      }
    });

    return sorted;
  }, [filter, units, debouncedSearchQuery, sortBy]);

  const filters: Array<{ value: FilterValue; label: string; count: number }> =
    useMemo(
      () => [
        { value: "all", label: "All", count: units.length },
        {
          value: "incomplete",
          label: "In progress",
          count: units.filter((unit) => {
            const total = unit.totalLessons ?? 0;
            const done = unit.completedLessons ?? 0;
            return total > 0 && done > 0 && done < total;
          }).length,
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
    const unitAccess = unit.access ?? "full";
    const isPreviewUnit = unitAccess === "preview";
    const isFreeSampleUnit = unit.isFreeSample === true;
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
      const baseClasses =
        "group relative flex flex-col rounded-3xl p-6 transition-all duration-500 cursor-pointer overflow-hidden";

      if (isCompleted) {
        return `${baseClasses} border border-green-500/20 bg-[#1a1d23] hover:border-green-500/40 shadow-[0_8px_32px_rgba(34,197,94,0.05)]`;
      } else if (isInProgress) {
        return `${baseClasses} border border-amber-500/20 bg-[#1a1d23] hover:border-amber-500/40 shadow-[0_8px_32px_rgba(245,158,11,0.05)]`;
      } else {
        return `${baseClasses} border border-white/5 bg-[#1a1d23] hover:border-[#4040f2]/40 shadow-xl`;
      }
    };

    const getIconContainerClasses = () => {
      const base =
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:scale-110";
      if (isCompleted) {
        return `${base} border border-green-500/20 bg-green-500/5`;
      } else if (isInProgress) {
        return `${base} border border-amber-500/20 bg-amber-500/5`;
      } else {
        return `${base} border border-white/5 bg-white/5`;
      }
    };

    const getProgressBarClasses = () => {
      if (isCompleted) {
        return "h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.4)]";
      } else if (isInProgress) {
        return "h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]";
      } else {
        return "h-full rounded-full bg-gradient-to-r from-[#4040f2] to-[#7c80ff] shadow-[0_0_8px_rgba(64,64,242,0.4)]";
      }
    };

    return (
      <motion.div
        key={unit.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -6 }}
        className="relative"
      >
        <Link
          href={`/curriculum/${unit.id}`}
          className={getCardClasses()}
          aria-label={`${unit.title} - ${isCompleted ? "Completed" : isInProgress ? "In progress" : "Not started"}`}
        >
          {/* Background effects */}
          <div
            className={cn(
              "absolute -right-8 -top-8 h-32 w-32 rounded-full blur-[64px] transition-opacity duration-500 opacity-20",
              isCompleted
                ? "bg-green-500"
                : isInProgress
                  ? "bg-amber-500"
                  : "bg-[#4040f2]"
            )}
          />

          <div className="relative z-10 flex items-start justify-between gap-4 mb-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-[10px] font-black uppercase tracking-tighter text-green-400">
                    <CheckCircle2 className="h-3 w-3" /> COMPLETED
                  </span>
                ) : isInProgress ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-tighter text-amber-400">
                    <Rocket className="h-3 w-3" /> IN PROGRESS
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-tighter text-[#a6a6a6]">
                    <BookOpen className="h-3 w-3" /> NOT STARTED
                  </span>
                )}

                {isPreviewUnit && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-tighter text-amber-200">
                    <Lock className="h-3 w-3" /> LOCKED
                  </span>
                )}
                {isFreeSampleUnit && !isPreviewUnit && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-tighter text-emerald-300">
                    FREE SAMPLE
                  </span>
                )}
              </div>

              <h3 className="font-inter leading-tight">
                {(() => {
                  const match = unit.title.match(/^(\d+)\.?\s*(.*)$/);
                  if (match) {
                    const [, number, rest] = match;
                    return (
                      <div className="flex flex-col">
                        <span className="text-3xl font-black text-white/20 -mb-2 tabular-nums">
                          {number.padStart(2, "0")}
                        </span>
                        <span className="text-xl font-bold text-white group-hover:text-[#4040f2] transition-colors line-clamp-2">
                          {rest}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <span className="text-xl font-bold text-white">
                      {unit.title}
                    </span>
                  );
                })()}
              </h3>
            </div>

            <div className={getIconContainerClasses()}>
              {isCompleted ? (
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              ) : isInProgress ? (
                <Rocket className="h-6 w-6 text-amber-400" />
              ) : (
                <BookOpen className="h-6 w-6 text-white/30" />
              )}
            </div>
          </div>

          <div className="relative z-10 mt-auto space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-inter font-bold uppercase tracking-wider">
                <span className="text-[#666666]">
                  {done} / {total} LESSONS
                </span>
                <span
                  className={cn(
                    isCompleted
                      ? "text-green-400"
                      : isInProgress
                        ? "text-amber-400"
                        : "text-[#4040f2]"
                  )}
                >
                  {percent}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/5 border border-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className={getProgressBarClasses()}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {isPreviewUnit ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = "/pricing";
                  }}
                  className="flex items-center gap-2 text-xs font-inter font-bold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Unlock unit
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs font-inter font-bold text-[#a6a6a6] group-hover:text-white transition-colors">
                  <span>
                    {isCompleted
                      ? "Review Unit"
                      : isInProgress
                        ? "Continue"
                        : "Start Unit"}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              )}
            </div>
          </div>
        </Link>
      </motion.div>
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
      <div className="p-6 space-y-10">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-inter text-red-200"
          >
            {error}
          </motion.div>
        )}

        <section className="grid gap-6 md:grid-cols-3">
          <motion.div
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d23] p-6 shadow-xl group"
          >
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-inner">
                <Compass className="h-6 w-6 text-amber-400" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-amber-500/80">
                  Next Step
                </p>
                <h3 className="text-lg font-inter font-bold text-white line-clamp-1">
                  {nextUnit ? nextUnit.title : "Coming soon"}
                </h3>
              </div>
            </div>
            {nextUnit && (
              <Link
                href={`/curriculum/${nextUnit.id}`}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-inter font-bold text-black transition-all duration-200 hover:bg-amber-400 hover:scale-[1.02] active:scale-95 shadow-[0_4px_20px_rgba(245,158,11,0.2)] cursor-pointer"
              >
                Continue Path
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </motion.div>

          <motion.div
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d23] p-6 shadow-xl group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-500/10 border border-green-500/20 shadow-inner">
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-green-500/80">
                  Total Progress
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-inter font-black text-white">
                    {totals.percent}%
                  </span>
                  <span className="text-xs font-inter text-[#a6a6a6]">
                    Completed
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5 border border-white/5 shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${totals.percent}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                />
              </div>
              <p className="text-[11px] font-inter text-[#a6a6a6] flex justify-between">
                <span>
                  {totals.completedLessons} of {totals.totalLessons} lessons
                </span>
                <span className="font-bold text-green-400/80">
                  {Math.round(totals.percent)}%
                </span>
              </p>
            </div>
          </motion.div>

          <motion.div
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d23] p-6 shadow-xl group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10 border border-purple-500/20 shadow-inner">
                <Layers className="h-6 w-6 text-purple-400" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-purple-500/80">
                  Units Available
                </p>
                <h3 className="text-2xl font-inter font-black text-white">
                  {units.length}
                </h3>
              </div>
            </div>
            <p className="mt-6 text-xs font-inter leading-relaxed text-[#a6a6a6]">
              Structured curriculum based on{" "}
              <span className="text-white font-medium">
                Modern Mandarin Grammar
              </span>
              . Explore by status or search below.
            </p>
          </motion.div>
        </section>

        <div
          className={
            "fixed right-4 md:right-6 z-50 transition-opacity duration-300 ease-out " +
            (showScrollTop ? "opacity-100" : "opacity-0 pointer-events-none")
          }
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          aria-hidden={!showScrollTop}
        >
          <button
            type="button"
            aria-label="Back to top"
            onClick={() => {
              const prefersReduced = window.matchMedia(
                "(prefers-reduced-motion: reduce)"
              ).matches;
              const scrollEl = document.querySelector(
                'main[class*="overflow-y-auto"]'
              ) as HTMLElement | null;
              if (scrollEl) {
                scrollEl.scrollTo({
                  top: 0,
                  behavior: prefersReduced ? "auto" : "smooth",
                });
              } else {
                window.scrollTo({
                  top: 0,
                  behavior: prefersReduced ? "auto" : "smooth",
                });
              }
            }}
            className="h-11 w-11 md:h-12 md:w-12 rounded-full bg-[#2e323a] border border-white/10 text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 shadow-md cursor-pointer touch-manipulation flex items-center justify-center"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
        </div>

        <section className="space-y-6">
          <div className="flex flex-col gap-6 p-1">
            {/* Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left side: Source & Search */}
              <div className="flex flex-col justify-between md:flex-row items-start md:items-center gap-4 flex-1">
                {/* Source Selectors */}
                <div className="flex items-center gap-1.5 bg-[#1a1d23] p-1.5 rounded-2xl border border-white/10">
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
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-inter font-bold uppercase tracking-wider transition-all duration-300",
                          active
                            ? "bg-[#4040f2] text-white shadow-[0_4px_12px_rgba(64,64,242,0.3)]"
                            : "text-[#a6a6a6] hover:text-white hover:bg-white/5"
                        )}
                        aria-pressed={active}
                      >
                        {s.title}
                      </button>
                    );
                  })}
                </div>

                {/* Search Input */}
                <div className="relative w-full md:w-80 group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a6a6a6] group-focus-within:text-white transition-colors">
                    <Search className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search units..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#1a1d23] border border-white/10 rounded-2xl py-3 pl-11 pr-11 text-sm font-inter text-white placeholder-[#666666] focus:outline-none focus:ring-2 focus:ring-[#4040f2]/50 focus:border-[#4040f2]/50 transition-all duration-200 shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#666666] hover:text-white hover:bg-white/10 transition-all"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right side: Filter & Sort */}
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-2 bg-[#1a1d23] p-1.5 rounded-2xl border border-white/10">
                  {filters.map(({ value, label, count }) => {
                    const isActive = filter === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        className={cn(
                          "relative px-4 py-2 rounded-xl text-xs font-inter font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer",
                          isActive
                            ? "bg-white text-black shadow-lg scale-[1.02]"
                            : "text-[#a6a6a6] hover:text-white hover:bg-white/5"
                        )}
                      >
                        {label}
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-md text-[10px] font-black",
                            isActive
                              ? "bg-black/10 text-black/60"
                              : "bg-white/5 text-[#666666]"
                          )}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-[180px] h-[48px] bg-[#1a1d23] border-white/10 rounded-2xl text-xs font-inter font-bold uppercase tracking-wider text-white hover:bg-[#2e323a] focus:ring-[#4040f2]/50 transition-all">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1d23] border-white/10 rounded-xl overflow-hidden shadow-2xl">
                    <SelectItem
                      value="order"
                      className="text-xs font-bold font-inter text-[#a6a6a6] focus:bg-white/5 focus:text-white py-3"
                    >
                      ORDER
                    </SelectItem>
                    <SelectItem
                      value="progress-low"
                      className="text-xs font-bold font-inter text-[#a6a6a6] focus:bg-white/5 focus:text-white py-3"
                    >
                      PROGRESS (LOW-HIGH)
                    </SelectItem>
                    <SelectItem
                      value="progress-high"
                      className="text-xs font-bold font-inter text-[#a6a6a6] focus:bg-white/5 focus:text-white py-3"
                    >
                      PROGRESS (HIGH-LOW)
                    </SelectItem>
                    <SelectItem
                      value="title"
                      className="text-xs font-bold font-inter text-[#a6a6a6] focus:bg-white/5 focus:text-white py-3"
                    >
                      TITLE (A-Z)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {debouncedSearchQuery.trim() && (
              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-sm font-inter text-[#666666]"
              >
                Showing{" "}
                <span className="text-white font-bold">
                  {filteredUnits.length}
                </span>{" "}
                units matching your search
              </motion.p>
            )}
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
