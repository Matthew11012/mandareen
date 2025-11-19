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
  Play,
  RotateCcw,
  ChevronUp,
  Lock,
} from "lucide-react";
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
        "group relative flex flex-col rounded-2xl p-5 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-[#222831]";

      if (isCompleted) {
        return `${baseClasses} border border-green-500/50 bg-gradient-to-br from-green-900/20 to-green-800/10 hover:border-green-500/70 hover:from-green-900/30 hover:to-green-800/20 hover:shadow-xl hover:scale-[1.02] shadow-lg ring-1 ring-green-500/30`;
      } else if (isInProgress) {
        return `${baseClasses} border border-amber-500/50 bg-gradient-to-br from-amber-900/20 to-amber-800/10 hover:border-amber-500/70 hover:from-amber-900/30 hover:to-amber-800/20 hover:shadow-xl hover:scale-[1.02] shadow-lg ring-1 ring-amber-500/30`;
      } else {
        return `${baseClasses} border border-white/10 bg-[#2e323a] hover:border-[#4040f2] hover:shadow-lg hover:scale-[1.02] shadow-md`;
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

    const getStatusBadge = () => {
      if (isCompleted) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-inter text-green-300">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        );
      } else if (isInProgress) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-inter text-amber-300">
            <Rocket className="h-3 w-3" /> In Progress
          </span>
        );
      } else {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs font-inter text-white/80">
            <BookOpen className="h-3 w-3" /> Not Started
          </span>
        );
      }
    };

    const renderAccessBadge = () => {
      if (isPreviewUnit) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-inter text-amber-100">
            <Lock className="h-3 w-3" /> Preview only
          </span>
        );
      }
      if (isFreeSampleUnit) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-inter text-emerald-200">
            <BookOpen className="h-3 w-3" /> Free sample
          </span>
        );
      }
      return null;
    };

    const getActionButton = () => {
      if (isPreviewUnit) {
        return (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-inter text-amber-200 transition-colors duration-200 hover:bg-amber-500/20 hover:border-amber-500/50 cursor-pointer"
            aria-label="Upgrade to unlock this unit"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              window.location.href = "/pricing";
            }}
          >
            <Lock className="h-3.5 w-3.5" />
            Unlock unit
          </button>
        );
      }

      if (isCompleted) {
        return (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = `/curriculum/${unit.id}`;
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-inter text-green-300 transition-colors duration-200 hover:bg-green-500/20 hover:border-green-500/50 cursor-pointer"
            aria-label="Review completed unit"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Review Unit
          </button>
        );
      } else if (isInProgress) {
        return (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = `/curriculum/${unit.id}`;
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-inter text-amber-300 transition-colors duration-200 hover:bg-amber-500/20 hover:border-amber-500/50 cursor-pointer"
            aria-label="Continue learning this unit"
          >
            <Play className="h-3.5 w-3.5" />
            Continue Learning
          </button>
        );
      } else {
        return (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = `/curriculum/${unit.id}`;
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-inter text-blue-300 transition-colors duration-200 hover:bg-blue-500/20 hover:border-blue-500/50 cursor-pointer"
            aria-label="Start this unit"
          >
            <Play className="h-3.5 w-3.5" />
            Start Unit
          </button>
        );
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
          <div className="flex-1 min-w-0 space-y-2">
            <h3 className="font-inter font-semibold text-white group-hover:text-white/90 leading-tight">
              {(() => {
                const match = unit.title.match(/^(\d+)\.?\s*(.*)$/);
                if (match) {
                  const [, number, rest] = match;
                  return (
                    <>
                      <span className="sm:text-2xl text-lg font-bold text-white/90">
                        {number}{" "}
                      </span>
                      <span className="sm:text-xl text-md">{rest}</span>
                    </>
                  );
                }
                return unit.title;
              })()}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {getStatusBadge()}
              {renderAccessBadge()}
            </div>
          </div>
          <div className={`flex-shrink-0 ${getIconContainerClasses()}`}>
            {getIconComponent()}
          </div>
        </div>
        <div className="mt-3 space-y-3 relative z-10">
          <div className="flex items-center justify-between text-xs font-inter text-white/80">
            <span aria-label="Lessons completed">
              {done} / {total} lessons
            </span>
            <span className="font-semibold">{percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div
              className={getProgressBarClasses()}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-end">{getActionButton()}</div>
        </div>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30 shrink-0">
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
            <p className="mt-2 text-xs font-inter text-white/80">
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
            <p className="mt-2 text-xs font-inter text-white/70">
              Filter by status to focus on what matters next.
            </p>
          </div>
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

        <section className="space-y-4">
          {/* Source selector and Search bar container */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

            {/* Search bar */}
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                <input
                  type="text"
                  placeholder="Search units by title"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 pr-10 bg-[#2e323a] border border-white/10 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors duration-200"
                  aria-label="Search curriculum units"
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <svg
                    className="w-4 h-4 text-white/50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded"
                    aria-label="Clear search"
                    type="button"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
              {debouncedSearchQuery.trim() && (
                <div className="text-sm text-white/70 whitespace-nowrap">
                  {filteredUnits.length} result
                  {filteredUnits.length !== 1 ? "s" : ""} found
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-inter font-semibold text-white">
              Units
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {/* Sort dropdown */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[200px] min-h-[44px] bg-[#2e323a] border-white/10 text-white hover:bg-[#2e323a]/80 focus:ring-blue-500/50">
                  <SelectValue placeholder="Sort by Order" />
                </SelectTrigger>
                <SelectContent className="bg-[#2e323a] border-white/10">
                  <SelectItem
                    value="order"
                    className="text-white hover:bg-white/10 focus:bg-white/10 hover:text-white focus:text-white data-[highlighted]:text-white"
                  >
                    Sort by Order
                  </SelectItem>
                  <SelectItem
                    value="progress-low"
                    className="text-white hover:bg-white/10 focus:bg-white/10 hover:text-white focus:text-white data-[highlighted]:text-white"
                  >
                    Progress (Low to High)
                  </SelectItem>
                  <SelectItem
                    value="progress-high"
                    className="text-white hover:bg-white/10 focus:bg-white/10 hover:text-white focus:text-white data-[highlighted]:text-white"
                  >
                    Progress (High to Low)
                  </SelectItem>
                  <SelectItem
                    value="title"
                    className="text-white hover:bg-white/10 focus:bg-white/10 hover:text-white focus:text-white data-[highlighted]:text-white"
                  >
                    Title (A-Z)
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2">
                {filters.map(({ value, label, count }) => {
                  const isActive = filter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      className={
                        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-inter transition-all duration-200 cursor-pointer min-h-[44px]" +
                        (isActive
                          ? " border-white bg-white text-black font-semibold shadow-md"
                          : " border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20 hover:scale-105")
                      }
                      aria-pressed={isActive}
                      aria-label={`Filter by ${label.toLowerCase()}`}
                    >
                      <span>{label}</span>
                      <span className="font-medium">{count}</span>
                    </button>
                  );
                })}
              </div>
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
