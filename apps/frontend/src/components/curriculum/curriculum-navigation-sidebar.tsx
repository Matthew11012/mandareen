"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  listUnits,
  getUnit,
  type CurriculumUnit,
  type CurriculumLesson,
} from "@/lib/api/curriculum";
import {
  ChevronRight,
  ChevronDown,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/hooks/use-reduced-motion-safe";

interface CurriculumSidebarProps {
  currentUnitId: number;
  currentLessonId: number;
}

interface UnitWithLessons extends CurriculumUnit {
  lessons?: CurriculumLesson[];
  isLoading?: boolean;
  error?: Error | null;
}

// Hook for fetching curriculum data
function useCurriculumData() {
  const [units, setUnits] = useState<CurriculumUnit[]>([]);
  const [unitsWithLessons, setUnitsWithLessons] = useState<
    Map<number, UnitWithLessons>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  // Fetch all units
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function fetchUnits() {
      try {
        setLoading(true);
        setError(null);
        const data = await listUnits();
        if (!mounted) return;
        setUnits(data);
      } catch (e) {
        if (!mounted || controller.signal.aborted) return;
        const err = e instanceof Error ? e : new Error("Failed to load units");
        setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void fetchUnits();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  // Track pending requests to prevent duplicate concurrent requests
  const pendingRequestsRef = useRef<Map<number, Promise<void>>>(new Map());

  // Lazy load lessons for a unit with request deduplication
  const loadUnitLessons = useCallback(
    async (unitId: number) => {
      // Check if already loaded
      const existing = unitsWithLessons.get(unitId);
      if (existing?.lessons) return;

      // Check if there's already a pending request for this unit
      const pendingRequest = pendingRequestsRef.current.get(unitId);
      if (pendingRequest) {
        // Wait for existing request to complete
        try {
          await pendingRequest;
        } catch {
          // Ignore errors from pending request, we'll handle our own
        }
        // Check again after pending request completes
        const updated = unitsWithLessons.get(unitId);
        if (updated?.lessons || updated?.isLoading) return;
      }

      // Get unit from units array
      const unit = units.find((u) => u.id === unitId);
      if (!unit) return;

      // Abort any existing request for this unit
      const existingController = abortControllersRef.current.get(unitId);
      if (existingController) {
        existingController.abort();
      }

      const controller = new AbortController();
      abortControllersRef.current.set(unitId, controller);

      // Mark as loading
      setUnitsWithLessons((prev) => {
        const next = new Map(prev);
        const current = next.get(unitId);
        // Only update if not already loading to prevent unnecessary re-renders
        if (!current?.isLoading) {
          next.set(unitId, { ...unit, isLoading: true, error: null });
        }
        return next;
      });

      // Create and track the request promise
      const requestPromise = (async () => {
        try {
          const data = await getUnit(unitId);
          if (controller.signal.aborted) return;

          setUnitsWithLessons((prev) => {
            const next = new Map(prev);
            next.set(unitId, {
              ...unit,
              lessons: data.lessons,
              isLoading: false,
              error: null,
            });
            return next;
          });
        } catch (e) {
          if (controller.signal.aborted) return;
          const err =
            e instanceof Error ? e : new Error("Failed to load lessons");
          setUnitsWithLessons((prev) => {
            const next = new Map(prev);
            next.set(unitId, { ...unit, isLoading: false, error: err });
            return next;
          });
          throw err;
        } finally {
          abortControllersRef.current.delete(unitId);
          pendingRequestsRef.current.delete(unitId);
        }
      })();

      // Track the pending request
      pendingRequestsRef.current.set(unitId, requestPromise);

      return requestPromise;
    },
    [units, unitsWithLessons]
  );

  // Cleanup on unmount
  useEffect(() => {
    const controllers = abortControllersRef.current;
    const pending = pendingRequestsRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      pending.clear();
    };
  }, []);

  return {
    units,
    unitsWithLessons,
    loading,
    error,
    loadUnitLessons,
  };
}

// Hook for sidebar state (URL-synced)
function useSidebarState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = searchParams.get("sidebar") === "open";

  const toggle = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (isOpen) {
      params.delete("sidebar");
    } else {
      params.set("sidebar", "open");
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [isOpen, searchParams, router, pathname]);

  const close = useCallback(() => {
    if (!isOpen) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sidebar");
    router.replace(`${pathname}?${params.toString()}`);
  }, [isOpen, searchParams, router, pathname]);

  return { isOpen, toggle, close };
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-lg border border-white/10 bg-white/5 animate-pulse"
        />
      ))}
    </div>
  );
}

// Lesson item component
interface LessonItemProps {
  lesson: CurriculumLesson;
  unitId: number;
  isCurrent: boolean;
  onNavigate?: () => void;
}

function LessonItem({
  lesson,
  unitId,
  isCurrent,
  onNavigate,
}: LessonItemProps) {
  const handleClick = () => {
    onNavigate?.();
  };
  const isCompleted = lesson.completed ?? false;

  return (
    <li>
      <Tooltip
        content={lesson.title}
        position="top"
        delay={300}
        className="z-[10000] w-full"
      >
        <Link
          href={`/curriculum/${unitId}/${lesson.id}`}
          onClick={handleClick}
          aria-current={isCurrent ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors duration-200 min-h-[44px] touch-manipulation w-full",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1d23]",
            isCurrent
              ? "bg-[#4040f2]/20 text-white font-semibold border border-[#4040f2]/30"
              : isCompleted
                ? "text-white/70 hover:bg-white/5 hover:text-white"
                : "text-white/80 hover:bg-white/5 hover:text-white"
          )}
        >
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          ) : (
            <div className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="flex-1 text-xs truncate block">{lesson.title}</span>
          {isCurrent && <span className="sr-only">Current lesson</span>}
        </Link>
      </Tooltip>
    </li>
  );
}

// Unit section component
interface UnitSectionProps {
  unit: UnitWithLessons;
  isExpanded: boolean;
  isCurrent: boolean;
  currentLessonId: number;
  onToggle: () => void;
  onLoadLessons: () => void;
  onLessonNavigate?: () => void;
}

function UnitSection({
  unit,
  isExpanded,
  isCurrent,
  currentLessonId,
  onToggle,
  onLoadLessons,
  onLessonNavigate,
}: UnitSectionProps) {
  const hasLessons = Array.isArray(unit.lessons) && unit.lessons.length > 0;
  const isLoading = unit.isLoading ?? false;
  const error = unit.error;
  const prefersReducedMotion = useReducedMotionSafe();

  // Load lessons when expanded
  useEffect(() => {
    if (isExpanded && !hasLessons && !isLoading && !error) {
      onLoadLessons();
    }
  }, [isExpanded, hasLessons, isLoading, error, onLoadLessons]);

  const progress =
    unit.totalLessons > 0
      ? Math.round((unit.completedLessons / unit.totalLessons) * 100)
      : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      className={cn(
        "border-b border-white/10 last:border-b-0",
        isCurrent && "bg-[#4040f2]/10"
      )}
    >
      <Tooltip
        content={unit.title}
        position="top"
        delay={300}
        className="z-[10000] w-full"
      >
        <button
          onClick={onToggle}
          onKeyDown={handleKeyDown}
          aria-expanded={isExpanded}
          aria-label={`${unit.title}, ${unit.completedLessons} of ${unit.totalLessons} lessons completed`}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-3 text-left transition-colors duration-200 min-h-[44px] touch-manipulation cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1d23]",
            "hover:bg-white/5",
            isCurrent && "bg-[#4040f2]/10"
          )}
        >
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-white/60" />
            ) : (
              <ChevronRight className="w-4 h-4 text-white/60" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs text-white truncate w-full">
              {unit.title}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-xs text-white/60 tabular-nums">
                {unit.completedLessons} / {unit.totalLessons}
              </div>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#4040f2] to-[#7c80ff] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="text-xs text-white/60 tabular-nums">
                {progress}%
              </div>
            </div>
          </div>
        </button>
      </Tooltip>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={
              prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { height: "auto", opacity: 1 }
            }
            exit={
              prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.15 }
                : {
                    height: {
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1],
                    },
                    opacity: {
                      duration: 0.2,
                      ease: [0.4, 0, 0.2, 1],
                    },
                  }
            }
            style={{ overflow: "hidden" }}
            className="pb-2"
          >
            {isLoading && (
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading lessons…</span>
                </div>
              </div>
            )}

            {error && (
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>Failed to load lessons</span>
                </div>
              </div>
            )}

            {hasLessons && (
              <ul className="space-y-1 px-2 mt-2" role="list">
                {unit
                  .lessons!.sort((a, b) => a.order - b.order)
                  .map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      unitId={unit.id}
                      isCurrent={lesson.id === currentLessonId}
                      onNavigate={onLessonNavigate}
                    />
                  ))}
              </ul>
            )}

            {!isLoading && !error && !hasLessons && (
              <div className="px-3 py-2 text-sm text-white/60">
                No lessons available
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main sidebar component
export function CurriculumNavigationSidebar({
  currentUnitId,
  currentLessonId,
}: CurriculumSidebarProps) {
  const { units, unitsWithLessons, loading, error, loadUnitLessons } =
    useCurriculumData();
  const { isOpen, close } = useSidebarState();
  const [expandedUnits, setExpandedUnits] = useState<Set<number>>(new Set());
  const sidebarRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const prefersReducedMotion = useReducedMotionSafe();

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // On desktop, sidebar is always visible (ignore URL state)
  const shouldShowSidebar = isMobile ? isOpen : true;

  // Auto-expand and prefetch current unit
  useEffect(() => {
    if (currentUnitId && units.length > 0) {
      setExpandedUnits((prev) => new Set(prev).add(currentUnitId));
      // Prefetch lessons for current unit to improve UX
      const currentUnit = unitsWithLessons.get(currentUnitId);
      if (!currentUnit?.lessons && !currentUnit?.isLoading) {
        // Prefetch in background without blocking
        loadUnitLessons(currentUnitId).catch(() => {
          // Silently fail prefetch - user can still expand manually
        });
      }
    }
  }, [currentUnitId, units.length, unitsWithLessons, loadUnitLessons]);

  // Focus management for mobile drawer
  useEffect(() => {
    if (isMobile && shouldShowSidebar) {
      // Store previous focus
      previousFocusRef.current =
        (document.activeElement as HTMLElement) || null;
      // Focus sidebar
      sidebarRef.current?.focus();
    } else if (isMobile && !shouldShowSidebar && previousFocusRef.current) {
      // Return focus
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isMobile, shouldShowSidebar]);

  // Close sidebar on mobile when navigating
  const handleLessonNavigate = useCallback(() => {
    if (isMobile && shouldShowSidebar) {
      close();
    }
  }, [isMobile, shouldShowSidebar, close]);

  // Keyboard navigation
  useEffect(() => {
    if (!shouldShowSidebar) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [shouldShowSidebar, close]);

  const toggleUnit = useCallback((unitId: number) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }, []);

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.id - b.id),
    [units]
  );

  // Don't render if not on lesson page
  const isLessonPage = pathname.match(/\/curriculum\/\d+\/\d+/);
  if (!isLessonPage) {
    return null;
  }

  return (
    <>
      {/* Mobile: Animated backdrop and sidebar */}
      {isMobile ? (
        <AnimatePresence>
          {shouldShowSidebar && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={
                  prefersReducedMotion
                    ? { opacity: 0, pointerEvents: "none" }
                    : { opacity: 0, pointerEvents: "none" }
                }
                animate={
                  prefersReducedMotion
                    ? { pointerEvents: "auto" }
                    : { opacity: 1, pointerEvents: "auto" }
                }
                exit={
                  prefersReducedMotion
                    ? { transitionEnd: { pointerEvents: "none" } }
                    : { opacity: 0, transitionEnd: { pointerEvents: "none" } }
                }
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={close}
                aria-hidden="true"
              />

              {/* Sidebar */}
              <motion.nav
                ref={sidebarRef}
                aria-label="Curriculum navigation"
                initial={
                  prefersReducedMotion
                    ? { pointerEvents: "none" }
                    : { x: "100%", pointerEvents: "none" }
                }
                animate={{
                  ...(prefersReducedMotion ? {} : { x: 0 }),
                  pointerEvents: "auto",
                }}
                exit={
                  prefersReducedMotion
                    ? { transitionEnd: { pointerEvents: "none" } }
                    : { x: "100%", transitionEnd: { pointerEvents: "none" } }
                }
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
                className={cn(
                  "fixed inset-y-0 right-0 z-50 w-[85vw] max-w-[320px] bg-[#1a1d23] border-l border-[#2e323a] flex flex-col h-full",
                  "md:hidden"
                )}
                style={{
                  paddingRight: "env(safe-area-inset-right, 0)",
                }}
                tabIndex={-1}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[#2e323a]">
                  <h2 className="font-semibold text-white text-sm">
                    Curriculum
                  </h2>
                  <button
                    onClick={close}
                    aria-label="Close navigation sidebar"
                    className="p-2 -mr-2 rounded-lg hover:bg-white/5 transition-colors duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <X className="w-5 h-5 text-white/80" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  {loading && <LoadingSkeleton />}

                  {error && (
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-sm text-red-400">
                        <AlertCircle className="w-4 h-4" />
                        <span>Failed to load units</span>
                      </div>
                    </div>
                  )}

                  {!loading && !error && sortedUnits.length === 0 && (
                    <div className="p-4 text-sm text-white/60">
                      No units available
                    </div>
                  )}

                  {!loading && !error && sortedUnits.length > 0 && (
                    <div className="py-2">
                      {sortedUnits.map((unit) => {
                        const unitWithLessons =
                          unitsWithLessons.get(unit.id) || unit;
                        const isExpanded = expandedUnits.has(unit.id);
                        const isCurrent = unit.id === currentUnitId;

                        return (
                          <UnitSection
                            key={unit.id}
                            unit={unitWithLessons}
                            isExpanded={isExpanded}
                            isCurrent={isCurrent}
                            currentLessonId={currentLessonId}
                            onToggle={() => toggleUnit(unit.id)}
                            onLoadLessons={() => loadUnitLessons(unit.id)}
                            onLessonNavigate={handleLessonNavigate}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Screen reader announcements */}
                <div aria-live="polite" aria-atomic="true" className="sr-only">
                  Navigation sidebar opened
                </div>
              </motion.nav>
            </>
          )}
        </AnimatePresence>
      ) : (
        /* Desktop: Always visible sidebar */
        <nav
          ref={sidebarRef}
          aria-label="Curriculum navigation"
          className="relative w-[280px] flex-shrink-0 bg-[#1a1d23] border-l border-[#2e323a] flex flex-col h-full"
          tabIndex={-1}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#2e323a]">
            <h2 className="font-semibold text-white text-sm">Curriculum</h2>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading && <LoadingSkeleton />}

            {error && (
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>Failed to load units</span>
                </div>
              </div>
            )}

            {!loading && !error && sortedUnits.length === 0 && (
              <div className="p-4 text-sm text-white/60">
                No units available
              </div>
            )}

            {!loading && !error && sortedUnits.length > 0 && (
              <div className="py-2">
                {sortedUnits.map((unit) => {
                  const unitWithLessons = unitsWithLessons.get(unit.id) || unit;
                  const isExpanded = expandedUnits.has(unit.id);
                  const isCurrent = unit.id === currentUnitId;

                  return (
                    <UnitSection
                      key={unit.id}
                      unit={unitWithLessons}
                      isExpanded={isExpanded}
                      isCurrent={isCurrent}
                      currentLessonId={currentLessonId}
                      onToggle={() => toggleUnit(unit.id)}
                      onLoadLessons={() => loadUnitLessons(unit.id)}
                      onLessonNavigate={handleLessonNavigate}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Screen reader announcements */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            Navigation sidebar
          </div>
        </nav>
      )}
    </>
  );
}
