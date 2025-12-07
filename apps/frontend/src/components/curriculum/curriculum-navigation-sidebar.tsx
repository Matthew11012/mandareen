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
  type CurriculumAccess,
} from "@/lib/api/curriculum";
import {
  ChevronRight,
  ChevronDown,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/hooks/use-reduced-motion-safe";

function SidebarToggleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      {...props}
    >
      <path d="M2 12C2 8.3109 2 6.46633 2.81382 5.1588C3.1149 4.67505 3.48891 4.2543 3.91891 3.91557C5.08116 3.00003 6.72077 3.00003 10 3.00003H14C17.2792 3.00003 18.9188 3.00003 20.0811 3.91557C20.5111 4.2543 20.8851 4.67505 21.1862 5.1588C22 6.46633 22 8.3109 22 12C22 15.6892 22 17.5337 21.1862 18.8413C20.8851 19.325 20.5111 19.7458 20.0811 20.0845C18.9188 21 17.2792 21 14 21H10C6.72077 21 5.08116 21 3.91891 20.0845C3.48891 19.7458 3.1149 19.325 2.81382 18.8413C2 17.5337 2 15.6892 2 12Z" />
      <path d="M14.5 3.00003L14.5 21" />
      <path d="M18 7.00006H19M18 10.0001H19" />
    </svg>
  );
}

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
              access: data.access ?? unit.access,
              isFreeSample: data.isFreeSample ?? unit.isFreeSample,
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

// Conditional tooltip component that only shows when text is truncated
interface ConditionalTooltipProps {
  content: string;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
  children: React.ReactElement;
}

function ConditionalTooltip({
  content,
  position = "top",
  delay = 300,
  className,
  children,
}: ConditionalTooltipProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // Check if text is truncated by finding the truncate element
  const checkTruncation = useCallback(() => {
    if (containerRef.current) {
      // Find the element with truncate class within the container
      const truncateElement = containerRef.current.querySelector(
        ".truncate"
      ) as HTMLElement | null;
      if (truncateElement) {
        const isTextTruncated =
          truncateElement.scrollWidth > truncateElement.clientWidth ||
          truncateElement.scrollHeight > truncateElement.clientHeight;
        setIsTruncated(isTextTruncated);
      }
    }
  }, []);

  // Check truncation after render
  useEffect(() => {
    // Use multiple strategies to ensure we catch the element after it's rendered
    const check = () => {
      if (containerRef.current) {
        checkTruncation();
      }
    };

    requestAnimationFrame(() => {
      check();
      setTimeout(check, 0);
      setTimeout(check, 50);
      setTimeout(check, 100);
    });
  }, [checkTruncation, content]);

  // Re-check on resize
  useEffect(() => {
    window.addEventListener("resize", checkTruncation);
    return () => {
      window.removeEventListener("resize", checkTruncation);
    };
  }, [checkTruncation]);

  // Use a wrapper div to measure truncation and anchor tooltip positioning
  const wrappedContent = (
    <div
      ref={(node) => {
        containerRef.current = node;
        if (node) {
          requestAnimationFrame(() => {
            checkTruncation();
          });
          setTimeout(checkTruncation, 0);
        }
      }}
      className="w-full"
      style={{ display: "block" }}
    >
      {children}
    </div>
  );

  // Always return wrapped content to check truncation, but only wrap in Tooltip if truncated
  if (!isTruncated) {
    return wrappedContent;
  }

  return (
    <Tooltip
      content={content}
      position={position}
      delay={delay}
      className={className}
    >
      {wrappedContent}
    </Tooltip>
  );
}

// Lesson item component
interface LessonItemProps {
  lesson: CurriculumLesson;
  unitId: number;
  isCurrent: boolean;
  onNavigate?: () => void;
  unitAccess?: CurriculumAccess;
}

function LessonItem({
  lesson,
  unitId,
  isCurrent,
  onNavigate,
  unitAccess,
}: LessonItemProps) {
  const handleClick = () => {
    onNavigate?.();
  };
  const isCompleted = lesson.completed ?? false;
  const lessonAccess = (lesson.access ??
    unitAccess ??
    "full") as CurriculumAccess;
  const isLocked = lessonAccess === "preview";

  return (
    <li>
      <ConditionalTooltip
        content={lesson.title}
        position="top"
        delay={300}
        className="z-[10000] w-full"
      >
        {isLocked ? (
          <div
            aria-disabled="true"
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm min-h-[44px] touch-manipulation w-full cursor-not-allowed opacity-60 bg-white/5 text-white/70",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1d23]"
            )}
          >
            <Lock className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <span className="flex-1 text-xs truncate block">
              {lesson.title}
            </span>
            <span className="text-[11px] text-amber-200">Preview</span>
          </div>
        ) : (
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
            <span className="flex-1 text-xs truncate block">
              {lesson.title}
            </span>
            {isCurrent && <span className="sr-only">Current lesson</span>}
          </Link>
        )}
      </ConditionalTooltip>
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
  isInitialAutoExpand?: boolean;
}

function UnitSection({
  unit,
  isExpanded,
  isCurrent,
  currentLessonId,
  onToggle,
  onLoadLessons,
  onLessonNavigate,
  isInitialAutoExpand = false,
}: UnitSectionProps) {
  const hasLessons = Array.isArray(unit.lessons) && unit.lessons.length > 0;
  const isLoading = unit.isLoading ?? false;
  const error = unit.error;
  const unitAccess = (unit.access ?? "full") as CurriculumAccess;
  const isLockedUnit = unitAccess === "preview";
  const prefersReducedMotion = useReducedMotionSafe();
  const hasAnimatedRef = useRef(false);
  const hasBeenManuallyToggledRef = useRef(false);
  const isFirstRenderRef = useRef(true);

  // Load lessons when expanded
  useEffect(() => {
    if (isExpanded && !hasLessons && !isLoading && !error) {
      onLoadLessons();
    }
  }, [isExpanded, hasLessons, isLoading, error, onLoadLessons]);

  // Track if unit has been manually toggled (user interaction)
  useEffect(() => {
    if (!isInitialAutoExpand && isExpanded) {
      // User manually expanded a unit that wasn't auto-expanded
      hasBeenManuallyToggledRef.current = true;
    }
  }, [isExpanded, isInitialAutoExpand]);

  // Track manual toggle for initially auto-expanded units
  // When user collapses an auto-expanded unit, mark it as manually toggled
  useEffect(() => {
    if (
      isInitialAutoExpand &&
      !isExpanded &&
      isFirstRenderRef.current === false
    ) {
      // User manually collapsed an initially auto-expanded unit
      hasBeenManuallyToggledRef.current = true;
    }
  }, [isExpanded, isInitialAutoExpand]);

  // Mark first render as complete after initial mount
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
    }
  }, []);

  // For initial auto-expand, mark as animated once content is loaded to prevent re-animation
  useEffect(() => {
    if (isInitialAutoExpand && isExpanded && hasLessons && !isLoading) {
      hasAnimatedRef.current = true;
    }
  }, [isInitialAutoExpand, isExpanded, hasLessons, isLoading]);

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
      <ConditionalTooltip
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
            <div className="flex items-center gap-2">
              <div className="font-medium text-xs text-white truncate w-full">
                {unit.title}
              </div>
              {isLockedUnit && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-inter text-amber-100">
                  <Lock className="w-3 h-3" /> Preview
                </span>
              )}
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
      </ConditionalTooltip>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            layout={false}
            initial={
              isInitialAutoExpand &&
              !hasBeenManuallyToggledRef.current &&
              !hasAnimatedRef.current
                ? false
                : prefersReducedMotion
                  ? { opacity: 0 }
                  : { height: 0, opacity: 0 }
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
              isInitialAutoExpand &&
              !hasBeenManuallyToggledRef.current &&
              !hasAnimatedRef.current
                ? { duration: 0 }
                : prefersReducedMotion
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
                {isLockedUnit && (
                  <li>
                    <div className="mx-1 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-inter text-amber-50">
                      Preview only – upgrade to Basic or Premium to unlock this
                      unit.
                    </div>
                  </li>
                )}
                {unit
                  .lessons!.sort((a, b) => a.order - b.order)
                  .map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      unitId={unit.id}
                      isCurrent={lesson.id === currentLessonId}
                      onNavigate={onLessonNavigate}
                      unitAccess={unit.access as CurriculumAccess | undefined}
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
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const prefersReducedMotion = useReducedMotionSafe();
  const initialAutoExpandedUnitsRef = useRef<Set<number>>(new Set());
  const previousUnitIdRef = useRef<number | null>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Reset desktop collapse when moving to mobile to keep mobile UX unchanged
  useEffect(() => {
    if (isMobile && isDesktopCollapsed) {
      setIsDesktopCollapsed(false);
    }
  }, [isMobile, isDesktopCollapsed]);

  // On desktop, sidebar is always visible (ignore URL state)
  const shouldShowSidebar = isMobile ? isOpen : true;

  // Auto-expand and prefetch current unit (only when currentUnitId changes)
  useEffect(() => {
    if (currentUnitId && units.length > 0) {
      const isUnitIdChange = previousUnitIdRef.current !== currentUnitId;

      if (isUnitIdChange) {
        // Only auto-expand when the unit ID actually changes
        setExpandedUnits((prev) => {
          const next = new Set(prev);
          if (!next.has(currentUnitId)) {
            // Track this as an initial auto-expand
            initialAutoExpandedUnitsRef.current.add(currentUnitId);
          }
          next.add(currentUnitId);
          return next;
        });
        previousUnitIdRef.current = currentUnitId;
      }

      // Prefetch lessons for current unit to improve UX (only if not already loaded)
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
    () =>
      [...units].sort((a, b) => {
        const aOrder = a.order ?? a.id;
        const bOrder = b.order ?? b.id;
        return aOrder - bOrder;
      }),
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
                        const isInitialAutoExpand =
                          initialAutoExpandedUnitsRef.current.has(unit.id);

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
                            isInitialAutoExpand={isInitialAutoExpand}
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
        <motion.nav
          ref={sidebarRef}
          aria-label="Curriculum navigation"
          aria-expanded={!isDesktopCollapsed}
          initial={false}
          animate={{ width: isDesktopCollapsed ? 56 : 280 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 260, damping: 26 }
          }
          className="relative flex-shrink-0 bg-[#1a1d23] border-l border-[#2e323a] flex flex-col h-full"
          tabIndex={-1}
        >
          {/* Header */}
          <div
            className={cn(
              "flex items-center gap-2 border-b border-[#2e323a]",
              isDesktopCollapsed ? "p-2 justify-start" : "p-2 justify-start"
            )}
          >
            <button
              type="button"
              onClick={() => setIsDesktopCollapsed((v) => !v)}
              aria-label={
                isDesktopCollapsed
                  ? "Expand curriculum sidebar"
                  : "Collapse curriculum sidebar"
              }
              className={cn(
                "rounded-lg hover:bg-white/5 transition-colors duration-200 flex items-center justify-center text-white/80 cursor-pointer",
                isDesktopCollapsed ? "p-1.5" : "p-2"
              )}
            >
              <SidebarToggleIcon className="w-5 h-5" />
            </button>
            {!isDesktopCollapsed && (
              <h2 className="font-semibold text-white text-sm">Curriculum</h2>
            )}
          </div>

          {/* Content */}
          {!isDesktopCollapsed && (
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
                    const isInitialAutoExpand =
                      initialAutoExpandedUnitsRef.current.has(unit.id);

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
                        isInitialAutoExpand={isInitialAutoExpand}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Screen reader announcements */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            Navigation sidebar
          </div>
        </motion.nav>
      )}
    </>
  );
}
