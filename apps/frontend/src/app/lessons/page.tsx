"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { DashboardLayout } from "@/components/layout";
import { useAuth, useRequireAuth } from "@/lib/hooks/use-auth";
import { lessonsApi, type LessonListItem } from "@/lib/api/lessons";
import { RefreshCw } from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import { useRouter } from "next/navigation";
import { useLessonsGenerationStore } from "@/lib/stores/lessons-generation-store";
import { useLessonGenerationStream } from "@/lib/hooks/use-lesson-generation-stream";
import { useLessonGenerationGuard } from "@/lib/hooks/use-lesson-generation-guard";
import { LayoutGroup } from "framer-motion";
import { notifyLessonReady } from "@/lib/notifications/notify-lesson-ready";
import { ProgressBanner } from "@/components/lessons/ProgressBanner";
import { LessonCard } from "@/components/lessons/LessonCard";
import { LessonCardSkeleton } from "@/components/lessons/LessonCardSkeleton";
import { Carousel } from "@/components/lessons/Carousel";
import {
  LessonGenerationErrorBanner,
  type LessonGenerationErrorState,
} from "@/components/lessons/LessonGenerationErrorBanner";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// SessionStorage persistence (no URL params)
const LS_KEYS = {
  mode: "mandareen.lessons.mode.v1",
  hsk: "mandareen.lessons.hsk.v1",
  time: "mandareen.lessons.time.v1",
  tags: "mandareen.lessons.tags.v1",
} as const;

function LessonsPageContent() {
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuth();
  const router = useRouter();
  const [allStories, setAllStories] = useState<LessonListItem[]>([]);
  const [allDialogues, setAllDialogues] = useState<LessonListItem[]>([]);
  const [myItems, setMyItems] = useState<LessonListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [storiesPage, setStoriesPage] = useState(0);
  const [dialoguesPage, setDialoguesPage] = useState(0);
  const [myStoriesPage, setMyStoriesPage] = useState(0);
  const [myDialoguesPage, setMyDialoguesPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const storiesRef = useRef<HTMLDivElement | null>(null);
  const dialoguesRef = useRef<HTMLDivElement | null>(null);
  const myStoriesRef = useRef<HTMLDivElement | null>(null);
  const topicTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const myDialoguesRef = useRef<HTMLDivElement | null>(null);

  const [genLevel, setGenLevel] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState<
    "modern" | "mythic" | "imperial" | "pre_modern" | "futuristic"
  >("modern");
  const cardsPerPage = isMobile ? 4 : 9;

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);

    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const [myLevels, setMyLevels] = useState<number[]>([]);
  const [storyLevels, setStoryLevels] = useState<number[]>([]);
  const [dialogueLevels, setDialogueLevels] = useState<number[]>([]);
  const toggleLevel = (
    arr: number[],
    setter: (v: number[]) => void,
    lvl: number
  ) => {
    if (arr.includes(lvl)) setter(arr.filter((x) => x !== lvl));
    else setter([...arr, lvl]);
  };

  const [topic, setTopic] = useState("");
  const [outputMode, setOutputMode] = useState<"story" | "dialogue">("story");
  const suggestions = [
    "At the market",
    "First day at university",
    "Ordering food at a restaurant",
    "Job interview",
    "Traveling on the subway",
    "Visiting the doctor",
  ];

  const [finishedIds, setFinishedIds] = useState<Set<number>>(new Set());

  // Tag filtering state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<{
    timeframe: Array<{ tag: string; count: number }>;
    content: Array<{ tag: string; count: number }>;
  } | null>(null);

  // Clear filters when user changes (prevents cross-account leakage in same tab)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(LS_KEYS.mode);
      sessionStorage.removeItem(LS_KEYS.hsk);
      sessionStorage.removeItem(LS_KEYS.time);
      sessionStorage.removeItem(LS_KEYS.tags);
    } catch {}
  }, [user?.id]);

  type TimeframeKey = typeof timeframe;
  const isValidTimeframe = (v: string | null): v is TimeframeKey =>
    v === "modern" ||
    v === "mythic" ||
    v === "imperial" ||
    v === "pre_modern" ||
    v === "futuristic";

  // Hydrate on first load and whenever the authenticated user changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Hydrate from sessionStorage
      const m = sessionStorage.getItem(LS_KEYS.mode);
      if (m === "story" || m === "dialogue") setOutputMode(m);

      const h = sessionStorage.getItem(LS_KEYS.hsk);
      if (h === "auto" || h === null) {
        // keep null (auto)
      } else if (!Number.isNaN(parseInt(h))) {
        setGenLevel(parseInt(h));
      }

      const t = sessionStorage.getItem(LS_KEYS.time);
      if (isValidTimeframe(t)) setTimeframe(t);

      const tags = sessionStorage.getItem(LS_KEYS.tags);
      if (tags) {
        try {
          const parsed = JSON.parse(tags);
          if (Array.isArray(parsed)) setSelectedTags(parsed);
        } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Debounced save on change (sessionStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.setItem(LS_KEYS.mode, outputMode);
        sessionStorage.setItem(
          LS_KEYS.hsk,
          genLevel == null ? "auto" : String(genLevel)
        );
        sessionStorage.setItem(LS_KEYS.time, timeframe);
        sessionStorage.setItem(LS_KEYS.tags, JSON.stringify(selectedTags));
      } catch {}
    }, 250);
    return () => window.clearTimeout(id);
  }, [outputMode, genLevel, timeframe, selectedTags]);

  // Per-section finished status filters
  type StatusFilter = "all" | "finished" | "unfinished";
  const [myStoriesStatus, setMyStoriesStatus] = useState<StatusFilter>("all");
  const [myDialoguesStatus, setMyDialoguesStatus] =
    useState<StatusFilter>("all");
  const [storiesStatus, setStoriesStatus] = useState<StatusFilter>("all");
  const [dialoguesStatus, setDialoguesStatus] = useState<StatusFilter>("all");

  // Prevent duplicate loads when state changes rapidly (e.g., filters/auth).
  const loadInFlight = useRef<Promise<void> | null>(null);
  const lastLoadKey = useRef<string>("");

  const load = useCallback(async () => {
    // Build a key from current filters to avoid reloading the same state.
    const key = JSON.stringify({
      selectedTags,
      timeframe,
      genLevel,
      outputMode,
    });
    if (loadInFlight.current && lastLoadKey.current === key) {
      await loadInFlight.current;
      return;
    }

    const run = (async () => {
      setLoading(true);
      setError(null);
      try {
        // Transform selectedTags into separate timeframe and content tags
        const timeframeTags = [
          "modern",
          "mythic",
          "imperial",
          "pre_modern",
          "futuristic",
        ];
        const selectedTimeframeTags = selectedTags.filter((tag) =>
          timeframeTags.includes(tag)
        );
        const selectedContentTags = selectedTags.filter(
          (tag) => !timeframeTags.includes(tag)
        );
        const includeUntagged = selectedTags.includes("untagged");

        const tagFilterParams = {
          timeframeTags:
            selectedTimeframeTags.length > 0
              ? selectedTimeframeTags
              : undefined,
          contentTags:
            selectedContentTags.length > 0 ? selectedContentTags : undefined,
          includeUntagged: includeUntagged,
        };

        const [allData, mineData, finished] = await Promise.all([
          lessonsApi.list(tagFilterParams),
          lessonsApi.listMine(tagFilterParams),
          lessonsApi.getFinishedIds().catch(() => ({ ids: [] })),
        ]);
        setMyItems(mineData);
        setAllStories(allData.filter((i) => i.lessonType === "story"));
        setAllDialogues(allData.filter((i) => i.lessonType === "dialogue"));
        setFinishedIds(new Set((finished?.ids || []) as number[]));
      } catch {
        setError("Failed to load lessons");
      } finally {
        setLoading(false);
        loadInFlight.current = null;
      }
    })();

    lastLoadKey.current = key;
    loadInFlight.current = run;
    await run;
  }, [selectedTags, timeframe, genLevel, outputMode]);

  // URL params removed by request; state is now local-only

  const getLevelPillColor = (level: number) => getHSKPillClasses(level);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  // Reload data when tag filters change
  useEffect(() => {
    if (!authLoading) {
      const timeoutId = setTimeout(() => {
        load();
      }, 300); // Debounce tag filter changes
      return () => clearTimeout(timeoutId);
    }
  }, [selectedTags, authLoading, load]);

  // Load available tags
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await lessonsApi.listTags();
        setAvailableTags(tags);
      } catch (error) {
        console.error("Failed to load tags:", error);
      }
    };
    loadTags();
  }, []);

  // Derived filtered data

  const myIdSet = useMemo(() => new Set(myItems.map((m) => m.id)), [myItems]);

  const myStoriesFiltered = useMemo(
    () =>
      myItems
        .filter((i) => i.lessonType === "story")
        .filter((i) =>
          myLevels.length > 0 ? myLevels.includes(i.level) : true
        )
        .filter((i) =>
          myStoriesStatus === "all"
            ? true
            : myStoriesStatus === "finished"
              ? finishedIds.has(i.id)
              : !finishedIds.has(i.id)
        ),
    [myItems, myLevels, myStoriesStatus, finishedIds]
  );

  const myDialoguesFiltered = useMemo(
    () =>
      myItems
        .filter((i) => i.lessonType === "dialogue")
        .filter((i) =>
          myLevels.length > 0 ? myLevels.includes(i.level) : true
        )
        .filter((i) =>
          myDialoguesStatus === "all"
            ? true
            : myDialoguesStatus === "finished"
              ? finishedIds.has(i.id)
              : !finishedIds.has(i.id)
        ),
    [myItems, myLevels, myDialoguesStatus, finishedIds]
  );

  const storiesFiltered = useMemo(
    () =>
      allStories
        .filter((i) => !myIdSet.has(i.id))
        .filter((i) =>
          storyLevels.length > 0 ? storyLevels.includes(i.level) : true
        )
        .filter((i) =>
          storiesStatus === "all"
            ? true
            : storiesStatus === "finished"
              ? finishedIds.has(i.id)
              : !finishedIds.has(i.id)
        ),
    [allStories, myIdSet, storyLevels, storiesStatus, finishedIds]
  );

  const dialoguesFiltered = useMemo(
    () =>
      allDialogues
        .filter((i) => !myIdSet.has(i.id))
        .filter((i) =>
          dialogueLevels.length > 0 ? dialogueLevels.includes(i.level) : true
        )
        .filter((i) =>
          dialoguesStatus === "all"
            ? true
            : dialoguesStatus === "finished"
              ? finishedIds.has(i.id)
              : !finishedIds.has(i.id)
        ),
    [allDialogues, myIdSet, dialogueLevels, dialoguesStatus, finishedIds]
  );

  // date label is computed inside LessonCard; keep out of page renders

  const paginateWithPadding = useCallback(
    (items: LessonListItem[]): (LessonListItem | null)[][] => {
      const perPage = cardsPerPage;
      const pages: (LessonListItem | null)[][] = [];
      for (let i = 0; i < items.length; i++) {
        const pageIdx = Math.floor(i / perPage);
        if (!pages[pageIdx]) pages[pageIdx] = [];
        pages[pageIdx].push(items[i]);
      }
      for (let i = 0; i < pages.length; i++) {
        const pad = Math.max(0, perPage - pages[i].length);
        if (pad > 0) pages[i] = [...pages[i], ...Array(pad).fill(null)];
      }
      return pages;
    },
    [cardsPerPage]
  );

  const myStoriesPages = useMemo(
    () => paginateWithPadding(myStoriesFiltered),
    [paginateWithPadding, myStoriesFiltered]
  );
  const myDialoguesPages = useMemo(
    () => paginateWithPadding(myDialoguesFiltered),
    [paginateWithPadding, myDialoguesFiltered]
  );
  const storiesPages = useMemo(
    () => paginateWithPadding(storiesFiltered),
    [paginateWithPadding, storiesFiltered]
  );
  const dialoguesPages = useMemo(
    () => paginateWithPadding(dialoguesFiltered),
    [paginateWithPadding, dialoguesFiltered]
  );

  const { start: startStream, attach: attachStream } =
    useLessonGenerationStream();
  const genStore = useLessonsGenerationStore();
  const generationInProgress = genStore.inProgress;
  const generationParams = genStore.params;
  const generationStartedAt = genStore.startedAt;
  const generationAttached = genStore.attached;
  const [progressOpen, setProgressOpen] = useState(false);
  const progressStep = genStore.progressStep as string | null;
  const completedSteps = genStore.completedSteps as Record<string, boolean>;
  const progressStepsOrder = [
    "openai_generate_dialogue",
    "segment_dialogue",
    "rag_retrieve_context",
    "openai_generate_grammar_notes",
    "segment_grammar_notes_and_tips",
    "persist_lesson",
  ];

  // Guard hook: checks usage limits and generation state
  const generationGuard = useLessonGenerationGuard(!authLoading);

  // Error state for SSE errors (quota, rate limit, etc.)
  const [generationError, setGenerationError] =
    useState<LessonGenerationErrorState | null>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  // Track notified lesson IDs to prevent duplicates
  const notifiedLessonIdsRef = useRef<Set<number>>(new Set());

  // Sync generation state on mount and detect stale state
  useEffect(() => {
    const startedAt = genStore.startedAt;
    const now = Date.now();

    if (genStore.inProgress && !genStore.attached) {
      genStore.reset();
      setGenerating(false);
      setProgressOpen(false);
      return;
    }

    const isStale =
      genStore.inProgress &&
      (!startedAt ||
        now - startedAt > 10 * 60 * 1000 ||
        startedAt > now + 60_000);

    if (isStale) {
      genStore.reset();
      setGenerating(false);
      setProgressOpen(false);
      return;
    }

    if (genStore.inProgress && !generating) {
      setGenerating(true);
      setProgressOpen(true);
    }
  }, [genStore, generating]);

  useEffect(() => {
    if (topicTextareaRef.current) {
      topicTextareaRef.current.style.height = "auto";
      topicTextareaRef.current.style.height = `${Math.min(topicTextareaRef.current.scrollHeight, 120)}px`;
    }
  }, [topic]);

  const handleLessonReady = useCallback(
    async (meta: {
      id: number;
      type: "story" | "dialogue";
      topic?: string;
      title?: string | null;
    }) => {
      if (!meta.id) return;

      // Check if we've already notified for this lesson ID
      if (notifiedLessonIdsRef.current.has(meta.id)) {
        return;
      }

      // Mark as notified immediately to prevent race conditions
      notifiedLessonIdsRef.current.add(meta.id);

      const effectiveTopic =
        meta.topic ??
        genStore.params?.topic ??
        genStore.lastCompletedLessonTopic ??
        null;

      let resolvedTitle: string | null =
        typeof meta.title === "string"
          ? meta.title
          : genStore.lastCompletedLessonTitle;

      if (!resolvedTitle || genStore.lastCompletedLessonId !== meta.id) {
        try {
          const detail = await lessonsApi.getById(meta.id);
          resolvedTitle = detail.title ?? null;
        } catch (error) {
          console.error("Failed to fetch lesson details:", error);
        }
      }

      genStore.setLastCompletedLesson({
        id: meta.id,
        title: resolvedTitle,
        topic: effectiveTopic,
      });

      notifyLessonReady({
        id: meta.id,
        title: resolvedTitle,
        topic: effectiveTopic ?? undefined,
        type: meta.type,
        onOpen: () => router.push(`/lessons/${meta.id}`),
      });
    },
    [genStore, router]
  );

  const handleGenerate = async () => {
    // Guard check: prevent generation if not allowed
    if (!generationGuard.canGenerate) {
      return;
    }

    setError(null);
    setGenerationError(null);
    setGenerating(true);
    setProgressOpen(true);
    const requestTopic = topic.trim() || undefined;
    startStream({
      level: genLevel ?? null,
      topic: requestTopic,
      readTimeMinutes: 10,
      type: "story",
      timeframe,
    });
    try {
      await attachStream({
        params: {
          level: genLevel ?? null,
          topic: requestTopic,
          readTimeMinutes: 10,
          type: "story",
          timeframe,
        },
        onComplete: async ({
          id,
          topic: completedTopic,
          title: completedTitle,
        }) => {
          await load();
          setProgressOpen(false);
          setGenerating(false);
          setGenerationError(null);
          genStore.finish();
          if (typeof id === "number") {
            await handleLessonReady({
              id,
              type: "story",
              topic: completedTopic ?? requestTopic,
              title: completedTitle ?? undefined,
            });
          }
        },
        onError: async (err?: unknown) => {
          // Handle SSE errors (quota, rate limit, etc.)
          const errorResponse =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: unknown }).response
              : null;
          if (
            errorResponse &&
            typeof errorResponse === "object" &&
            errorResponse !== null
          ) {
            const data = errorResponse as Record<string, unknown>;
            const code = typeof data.code === "string" ? data.code : undefined;
            const message =
              typeof data.message === "string" ? data.message : undefined;
            const retryAfter =
              typeof data.retryAfter === "number" ? data.retryAfter : undefined;
            const resource =
              typeof data.resource === "string" ? data.resource : undefined;
            const planCap =
              typeof data.planCap === "number" ? data.planCap : undefined;
            const used = typeof data.used === "number" ? data.used : undefined;
            const limit =
              typeof data.limit === "number" ? data.limit : undefined;

            if (code === "QUOTA_EXCEEDED") {
              setGenerationError({
                type: "quota_exceeded",
                message:
                  message ||
                  "You've reached your custom lesson generation limit.",
                resource,
                planCap,
                used,
              });
              errorBannerRef.current?.focus();
            } else if (code === "RATE_LIMITED") {
              setGenerationError({
                type: "rate_limited",
                message:
                  message ||
                  "Please slow down. You're generating lessons too quickly.",
                resource,
                retryAfter: retryAfter
                  ? Date.now() + retryAfter * 1000
                  : undefined,
              });
              errorBannerRef.current?.focus();
            } else if (code === "CONCURRENCY_LIMIT") {
              setGenerationError({
                type: "concurrency_limit",
                message:
                  message || "Only one lesson can be generated at a time.",
                resource,
                limit,
                retryAfter: retryAfter
                  ? Date.now() + retryAfter * 1000
                  : undefined,
              });
              errorBannerRef.current?.focus();
            } else {
              setGenerationError({
                type: "generic",
                message: message || "Generation failed",
              });
              errorBannerRef.current?.focus();
            }
          }
          try {
            await load();
            const startedAt = genStore.startedAt || Date.now();
            const startedThreshold = startedAt - 60_000;
            const recentMine = myItems
              .filter((i) => i.lessonType === "story")
              .filter(
                (i) => new Date(i.createdAt).getTime() >= startedThreshold
              )
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
              );
            if (recentMine.length > 0) {
              const recentId = recentMine[0].id;
              setProgressOpen(false);
              setGenerating(false);
              genStore.finish();
              await handleLessonReady({
                id: recentId,
                type: "story",
                topic: genStore.params?.topic ?? requestTopic,
              });
              return;
            }
          } catch {}
          if (!generationError) {
            setError("Failed to generate lesson");
          }
          setGenerating(false);
          setProgressOpen(false);
          genStore.finish();
        },
        markAllComplete: () => {
          [
            "openai_generate_story",
            "segment_story",
            "openai_generate_grammar_notes",
            "segment_grammar_notes_and_tips",
            "persist_lesson",
          ].forEach((k) => genStore.markCompleted(k));
        },
      });
    } catch (err) {
      // Handle non-SSE errors (network, etc.)
      const errorResponse =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: unknown }).response
          : null;
      if (
        errorResponse &&
        typeof errorResponse === "object" &&
        errorResponse !== null
      ) {
        const data = errorResponse as Record<string, unknown>;
        const code = typeof data.code === "string" ? data.code : undefined;
        const message =
          typeof data.message === "string" ? data.message : undefined;
        const retryAfter =
          typeof data.retryAfter === "number" ? data.retryAfter : undefined;
        const resource =
          typeof data.resource === "string" ? data.resource : undefined;
        const planCap =
          typeof data.planCap === "number" ? data.planCap : undefined;
        const used = typeof data.used === "number" ? data.used : undefined;
        const limit = typeof data.limit === "number" ? data.limit : undefined;

        if (code === "QUOTA_EXCEEDED") {
          setGenerationError({
            type: "quota_exceeded",
            message:
              message || "You've reached your custom lesson generation limit.",
            resource,
            planCap,
            used,
          });
          errorBannerRef.current?.focus();
        } else if (code === "RATE_LIMITED") {
          setGenerationError({
            type: "rate_limited",
            message:
              message ||
              "Please slow down. You're generating lessons too quickly.",
            resource,
            retryAfter: retryAfter ? Date.now() + retryAfter * 1000 : undefined,
          });
          errorBannerRef.current?.focus();
        } else if (code === "CONCURRENCY_LIMIT") {
          setGenerationError({
            type: "concurrency_limit",
            message: message || "Only one lesson can be generated at a time.",
            resource,
            limit,
            retryAfter: retryAfter ? Date.now() + retryAfter * 1000 : undefined,
          });
          errorBannerRef.current?.focus();
        } else {
          setError(message || "Failed to generate lesson");
        }
      } else {
        setError("Failed to generate lesson");
      }
      setGenerating(false);
      setProgressOpen(false);
      genStore.finish();
    }
  };

  const handleGenerateDialogue = async () => {
    // Guard check: prevent generation if not allowed
    if (!generationGuard.canGenerate) {
      return;
    }

    setError(null);
    setGenerationError(null);
    setGenerating(true);
    setProgressOpen(true);
    const requestTopic = topic.trim() || undefined;
    startStream({
      level: genLevel ?? null,
      topic: requestTopic,
      readTimeMinutes: 8,
      type: "dialogue",
      timeframe,
    });
    try {
      await attachStream({
        params: {
          level: genLevel ?? null,
          topic: requestTopic,
          readTimeMinutes: 8,
          type: "dialogue",
          timeframe,
        },
        onComplete: async ({
          id,
          topic: completedTopic,
          title: completedTitle,
        }) => {
          await load();
          setProgressOpen(false);
          setGenerating(false);
          setGenerationError(null);
          genStore.finish();
          if (typeof id === "number") {
            await handleLessonReady({
              id,
              type: "dialogue",
              topic: completedTopic ?? requestTopic,
              title: completedTitle ?? undefined,
            });
          }
        },
        onError: async (err?: unknown) => {
          // Handle SSE errors (quota, rate limit, etc.)
          const errorResponse =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: unknown }).response
              : null;
          if (
            errorResponse &&
            typeof errorResponse === "object" &&
            errorResponse !== null
          ) {
            const data = errorResponse as Record<string, unknown>;
            const code = typeof data.code === "string" ? data.code : undefined;
            const message =
              typeof data.message === "string" ? data.message : undefined;
            const retryAfter =
              typeof data.retryAfter === "number" ? data.retryAfter : undefined;
            const resource =
              typeof data.resource === "string" ? data.resource : undefined;
            const planCap =
              typeof data.planCap === "number" ? data.planCap : undefined;
            const used = typeof data.used === "number" ? data.used : undefined;
            const limit =
              typeof data.limit === "number" ? data.limit : undefined;

            if (code === "QUOTA_EXCEEDED") {
              setGenerationError({
                type: "quota_exceeded",
                message:
                  message ||
                  "You've reached your custom lesson generation limit.",
                resource,
                planCap,
                used,
              });
              errorBannerRef.current?.focus();
            } else if (code === "RATE_LIMITED") {
              setGenerationError({
                type: "rate_limited",
                message:
                  message ||
                  "Please slow down. You're generating lessons too quickly.",
                resource,
                retryAfter: retryAfter
                  ? Date.now() + retryAfter * 1000
                  : undefined,
              });
              errorBannerRef.current?.focus();
            } else if (code === "CONCURRENCY_LIMIT") {
              setGenerationError({
                type: "concurrency_limit",
                message:
                  message || "Only one lesson can be generated at a time.",
                resource,
                limit,
                retryAfter: retryAfter
                  ? Date.now() + retryAfter * 1000
                  : undefined,
              });
              errorBannerRef.current?.focus();
            } else {
              setGenerationError({
                type: "generic",
                message: message || "Generation failed",
              });
              errorBannerRef.current?.focus();
            }
          }
          try {
            await load();
            const startedAt = genStore.startedAt || Date.now();
            const startedThreshold = startedAt - 60_000;
            const recentMine = myItems
              .filter((i) => i.lessonType === "dialogue")
              .filter(
                (i) => new Date(i.createdAt).getTime() >= startedThreshold
              )
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
              );
            if (recentMine.length > 0) {
              const recentId = recentMine[0].id;
              setProgressOpen(false);
              setGenerating(false);
              genStore.finish();
              await handleLessonReady({
                id: recentId,
                type: "dialogue",
                topic: genStore.params?.topic ?? requestTopic,
              });
              return;
            }
          } catch {}
          setError("Generation failed");
          setGenerating(false);
          setProgressOpen(false);
          genStore.finish();
        },
        markAllComplete: () => {
          progressStepsOrder.forEach((k) => genStore.markCompleted(k));
        },
      });
    } catch {
      setError("Generation failed");
      setGenerating(false);
      setProgressOpen(false);
      genStore.finish();
    }
  };

  const onGenerate = () => {
    if (outputMode === "story") return handleGenerate();
    return handleGenerateDialogue();
  };

  // Reattach on mount if generation is underway: avoid starting a new SSE; poll for completion
  useEffect(() => {
    if (
      !generationInProgress ||
      generationAttached ||
      !generationParams ||
      !generationStartedAt
    ) {
      return;
    }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    // Reset stale generations that exceeded 10 minutes
    if (Date.now() - generationStartedAt > 10 * 60 * 1000) {
      genStore.reset();
      setProgressOpen(false);
      return;
    }

    setProgressOpen(true);

    const poll = async () => {
      if (cancelled) {
        return;
      }
      try {
        const createdAfter = generationStartedAt - 60_000;
        const type =
          generationParams.type ??
          (generationParams.readTimeMinutes === 10 ? "story" : "dialogue");
        const mineData = await lessonsApi.listMine();
        const candidates = mineData
          .filter((i) => i.lessonType === type)
          .filter((i) => new Date(i.createdAt).getTime() >= createdAfter)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        if (candidates.length > 0) {
          const id = candidates[0].id;
          if (!notifiedLessonIdsRef.current.has(id)) {
            genStore.finish();
            setProgressOpen(false);
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            setGenerating(false);
            await load();
            await handleLessonReady({
              id,
              type,
              topic: generationParams.topic ?? undefined,
            });
          }
        }
      } catch {}
    };

    void poll();
    interval = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [
    generationInProgress,
    generationParams,
    generationStartedAt,
    generationAttached,
    genStore,
    handleLessonReady,
    load,
  ]);

  // rAF-throttled scroll handlers to reduce layout work
  const myStoriesRaf = useRef<number | null>(null);
  const myDialoguesRaf = useRef<number | null>(null);
  const storiesRaf = useRef<number | null>(null);
  const dialoguesRaf = useRef<number | null>(null);

  const handleScrollPaged = useCallback(
    (
      ref: React.RefObject<HTMLDivElement | null>,
      setPage: (n: number) => void,
      rafRef: React.MutableRefObject<number | null>
    ) => {
      const el = ref.current;
      if (!el) return;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        setPage(idx);
      });
    },
    []
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 motion-safe:animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <DashboardLayout
      title="AI Lessons"
      subtitle="Generate and study AI-crafted lessons"
    >
      <div className="p-6 pt-4 space-y-6">
        {/* Top progress box (non-blocking) */}
        {progressOpen && (
          <ProgressBanner
            readTimeMinutes={genStore.params?.readTimeMinutes || null}
            progressStep={progressStep}
            completedSteps={completedSteps}
            dialogueSteps={progressStepsOrder}
          />
        )}
        {/* Topic & Generation Options */}
        <div className="bg-[#2e323a] rounded-xl p-4 border border-[#404040] space-y-3">
          <div className="text-white font-inter font-semibold">
            Generate New Lesson
          </div>
          <div className="flex flex-wrap gap-2">
            {(isMobile ? suggestions.slice(0, 4) : suggestions).map((s) => (
              <button
                key={s}
                onClick={() => setTopic(s)}
                className={`px-3 py-1 rounded-full text-sm font-inter border min-h-[44px] sm:min-h-[24px] ${
                  topic === s
                    ? "border-[#4040f2] text-[#9aa6ff] bg-[#4040f2]/10"
                    : "border-[#404040] text-[#c9c9c9] hover:bg-[#4040f2]/10"
                } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[#2e323a]`}
                type="button"
                aria-pressed={topic === s}
                aria-label={`Use topic ${s}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="lesson-topic" className="sr-only">
              Topic
            </label>
            <div className="flex-1">
              <div className="relative">
                <textarea
                  ref={topicTextareaRef}
                  id="lesson-topic"
                  className="w-full bg-transparent border border-[#404040] rounded-lg px-3 py-2 pr-9 text-white placeholder-[#888] focus:outline-none min-h-[44px] resize-none overflow-hidden"
                  placeholder="Type your topic..."
                  value={topic}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 500);
                    setTopic(value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onGenerate();
                    }
                  }}
                  name="lesson-topic"
                  autoComplete="off"
                  maxLength={500}
                  rows={1}
                />
                {topic && (
                  <button
                    type="button"
                    onClick={() => {
                      setTopic("");
                      if (topicTextareaRef.current) {
                        topicTextareaRef.current.style.height = "auto";
                      }
                    }}
                    aria-label="Clear topic"
                    className="absolute top-2 right-0 px-3 text-[#c9c9c9] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[#2e323a]"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs text-[#666]">{topic.length}/500</span>
              </div>
            </div>
          </div>
          <div className="pt-1">
            <fieldset
              className="grid grid-cols-2 gap-4 md:grid-cols-3"
              aria-labelledby="gen-options-legend"
            >
              <legend id="gen-options-legend" className="sr-only">
                Generation Options
              </legend>
              {/* Lesson Type select - desktop in-row; mobile spans full width row 2 */}
              <div className="col-span-2 md:col-span-1">
                <div
                  id="label-lesson-type"
                  className="text-white font-inter font-semibold mb-2 text-sm"
                >
                  Lesson Type
                </div>
                <Select
                  value={outputMode}
                  onValueChange={(v) => setOutputMode(v as typeof outputMode)}
                >
                  <SelectTrigger
                    id="trigger-lesson-type"
                    aria-labelledby="label-lesson-type"
                    className="w-full bg-transparent border-[#404040] text-white min-h-[44px] focus-visible:ring-orange-400"
                  >
                    <SelectValue placeholder="Select lesson type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2e323a] border-[#404040]">
                    <SelectItem
                      value="story"
                      className="text-white hover:bg-[#404040]"
                    >
                      Story
                    </SelectItem>
                    <SelectItem
                      value="dialogue"
                      className="text-white hover:bg-[#404040]"
                    >
                      Dialogue
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div
                  id="label-hsk"
                  className="text-white font-inter font-semibold mb-2 text-sm"
                >
                  HSK Level
                </div>
                <Select
                  value={genLevel?.toString() || "auto"}
                  onValueChange={(value) =>
                    setGenLevel(value === "auto" ? null : parseInt(value))
                  }
                >
                  <SelectTrigger
                    id="trigger-hsk"
                    aria-labelledby="label-hsk"
                    aria-describedby="help-hsk"
                    className="w-full bg-transparent border-[#404040] text-white min-h-[44px] focus-visible:ring-orange-400"
                  >
                    <SelectValue placeholder="Select HSK level" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2e323a] border-[#404040]">
                    <SelectItem
                      value="auto"
                      className="text-white hover:bg-[#404040]"
                    >
                      Auto (my level)
                    </SelectItem>
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const lvl = idx + 1;
                      return (
                        <SelectItem
                          key={lvl}
                          value={lvl.toString()}
                          className="text-white hover:bg-[#404040]"
                        >
                          HSK {lvl}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div
                  id="label-timeframe"
                  className="text-white font-inter font-semibold mb-2 text-sm"
                >
                  Timeframe
                </div>
                <Select
                  value={timeframe}
                  onValueChange={(value) =>
                    setTimeframe(value as typeof timeframe)
                  }
                >
                  <SelectTrigger
                    id="trigger-timeframe"
                    aria-labelledby="label-timeframe"
                    className="w-full bg-transparent border-[#404040] text-white min-h-[44px] focus-visible:ring-orange-400"
                  >
                    <SelectValue placeholder="Select timeframe" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2e323a] border-[#404040]">
                    <SelectItem
                      value="modern"
                      className="text-white hover:bg-[#404040]"
                    >
                      Modern
                    </SelectItem>
                    <SelectItem
                      value="mythic"
                      className="text-white hover:bg-[#404040]"
                    >
                      Mythic
                    </SelectItem>
                    <SelectItem
                      value="imperial"
                      className="text-white hover:bg-[#404040]"
                    >
                      Imperial
                    </SelectItem>
                    <SelectItem
                      value="pre_modern"
                      className="text-white hover:bg-[#404040]"
                    >
                      Pre-modern
                    </SelectItem>
                    <SelectItem
                      value="futuristic"
                      className="text-white hover:bg-[#404040]"
                    >
                      Futuristic
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>
          </div>
          {/* Error Banner */}
          {generationError && (
            <LessonGenerationErrorBanner
              ref={errorBannerRef}
              error={generationError}
              onDismiss={() => setGenerationError(null)}
              className="mb-3"
            />
          )}
          <div className="pt-2">
            <button
              onClick={onGenerate}
              disabled={
                generating ||
                !generationGuard.canGenerate ||
                generationGuard.isLoading
              }
              className="w-full sm:w-auto px-3 py-2 sm:px-4 bg-orange-500/70 text-white rounded-lg hover:bg-orange-600/70 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[#2e323a] min-h-[44px]"
              type="button"
              aria-label={`Generate ${outputMode}`}
              title={generationGuard.disabledReason || undefined}
            >
              <div className="flex items-center gap-2 justify-center">
                {generating ? (
                  <div
                    className="h-4 w-4 rounded-full border-2 border-white border-t-transparent motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 md:w-5 md:h-5 shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      d="M15.5 10C15.5 10 15.7332 12.9028 16.9152 14.0848C18.0972 15.2668 21 15.5 21 15.5C21 15.5 18.0972 15.7332 16.9152 16.9152C15.7332 18.0972 15.5 21 15.5 21C15.5 21 15.2668 18.0972 14.0848 16.9152C12.9028 15.7332 10 15.5 10 15.5C10 15.5 12.9028 15.2668 14.0848 14.0848C15.2668 12.9028 15.5 10 15.5 10Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6.5 5C6.5 5 6.64838 6.84721 7.40059 7.59942C8.15279 8.35162 10 8.5 10 8.5C10 8.5 8.15279 8.64838 7.40059 9.40059C6.64838 10.1528 6.5 12 6.5 12C6.5 12 6.35162 10.1528 5.59942 9.40059C4.84721 8.64838 3 8.5 3 8.5C3 8.5 4.84721 8.35162 5.59942 7.59942C6.35162 6.84721 6.5 5 6.5 5Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15.5 3C15.5 3 15.5636 3.79166 15.886 4.11404C16.2083 4.43641 17 4.5 17 4.5C17 4.5 16.2083 4.56359 15.886 4.88597C15.5636 5.20834 15.5 6 15.5 6C15.5 6 15.4364 5.20834 15.114 4.88597C14.7917 4.56359 14 4.5 14 4.5C14 4.5 14.7917 4.43641 15.114 4.11404C15.4364 3.79166 15.5 3 15.5 3Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <span className="font-inter text-sm sm:text-base">
                  Generate
                </span>
              </div>
            </button>
            <div className="sr-only" aria-live="polite">
              {generating
                ? outputMode === "story"
                  ? "Generating story…"
                  : "Generating dialogue…"
                : ""}
            </div>
          </div>
        </div>

        <div className="flex flex-row items-center justify-between">
          <div className="flex-shrink-0">
            {availableTags && (
              <MultiSelect
                options={[
                  {
                    heading: "Timeframe",
                    options: (availableTags?.timeframe || [])
                      .filter((tagObj) => tagObj?.tag) // Filter out any undefined tags
                      .map((tagObj) => ({
                        value: tagObj.tag,
                        label: `${tagObj.tag
                          .split("_")
                          .map(
                            (word) =>
                              word.charAt(0).toUpperCase() + word.slice(1)
                          )
                          .join(" ")} (${tagObj.count})`,
                        style: { badgeColor: "#4040f2", iconColor: "#ffffff" },
                      })),
                  },
                  {
                    heading: "Content",
                    options: (availableTags?.content || [])
                      .filter((tagObj) => tagObj?.tag) // Filter out any undefined tags
                      .map((tagObj) => ({
                        value: tagObj.tag,
                        label: `${tagObj.tag
                          .split("_")
                          .map(
                            (word) =>
                              word.charAt(0).toUpperCase() + word.slice(1)
                          )
                          .join(" ")} (${tagObj.count})`,
                        style: { badgeColor: "#f97316", iconColor: "#ffffff" },
                      })),
                  },
                  {
                    heading: "Other",
                    options: [
                      {
                        value: "untagged",
                        label: "Untagged Lessons",
                        style: { badgeColor: "#6b7280", iconColor: "#ffffff" },
                      },
                    ],
                  },
                ]}
                onValueChange={setSelectedTags}
                defaultValue={selectedTags}
                placeholder="Filter by tags"
                responsive={true}
                searchable={true}
                variant="inverted"
                className="border-[#404040]"
                popoverClassName="bg-[#2e323f] border-[#404040] focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-none"
              />
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 hover:bg-orange-500/20 rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[#222831]"
            title="Refresh"
            type="button"
            aria-label="Refresh lessons"
          >
            <RefreshCw
              className={`w-4 h-4 text-[#a6a6a6] ${loading ? "motion-safe:animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {error && <p className="text-red-400 font-inter text-sm">{error}</p>}

        {loading ? (
          <div className="space-y-8" aria-live="polite">
            {/* My Lessons Section Skeleton */}
            <div className="space-y-3">
              <div className="flex gap-2 flex-col md:flex-row md:items-center justify-between">
                <div className="h-6 w-32 bg-[#404040] rounded motion-safe:animate-pulse" />
                <div className="h-6 w-48 bg-[#404040] rounded motion-safe:animate-pulse" />
              </div>
              {/* My Stories Skeleton */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-24 bg-[#404040] rounded motion-safe:animate-pulse" />
                  <div className="h-7 w-32 bg-[#404040] rounded motion-safe:animate-pulse" />
                </div>
                <div className="overflow-hidden py-2">
                  <div className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide">
                    <div className="min-w-full snap-start flex items-stretch">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                        {Array.from({ length: cardsPerPage }).map((_, i) => (
                          <LessonCardSkeleton
                            key={`skeleton-my-stories-${i}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* My Dialogues Skeleton */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-28 bg-[#404040] rounded motion-safe:animate-pulse" />
                  <div className="h-7 w-32 bg-[#404040] rounded motion-safe:animate-pulse" />
                </div>
                <div className="overflow-hidden py-2">
                  <div className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide">
                    <div className="min-w-full snap-start flex items-stretch">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                        {Array.from({ length: cardsPerPage }).map((_, i) => (
                          <LessonCardSkeleton
                            key={`skeleton-my-dialogues-${i}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-[#3a3a3a]" />

            {/* Stories Section Skeleton */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="h-6 w-20 bg-[#404040] rounded motion-safe:animate-pulse" />
                <div className="h-6 w-64 bg-[#404040] rounded motion-safe:animate-pulse" />
              </div>
              <div className="overflow-hidden py-2">
                <div className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide">
                  <div className="min-w-full snap-start flex items-stretch">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                      {Array.from({ length: cardsPerPage }).map((_, i) => (
                        <LessonCardSkeleton key={`skeleton-stories-${i}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-[#3a3a3a]" />

            {/* Dialogues Section Skeleton */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="h-6 w-24 bg-[#404040] rounded motion-safe:animate-pulse" />
                <div className="h-6 w-64 bg-[#404040] rounded motion-safe:animate-pulse" />
              </div>
              <div className="overflow-hidden py-2">
                <div className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide">
                  <div className="min-w-full snap-start flex items-stretch">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                      {Array.from({ length: cardsPerPage }).map((_, i) => (
                        <LessonCardSkeleton key={`skeleton-dialogues-${i}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : allStories.length === 0 &&
          allDialogues.length === 0 &&
          myItems.length === 0 ? (
          <div className="text-[#a6a6a6] font-inter text-sm">
            No lessons yet. Click &quot;Generate&quot; to create one.
          </div>
        ) : (
          <div className="space-y-8">
            {/* My Lessons Section */}
            <div className="space-y-3">
              <div className="flex gap-2 flex-col md:flex-row md:items-center justify-between ">
                <h2 className="text-white font-inter font-semibold">
                  My Lessons
                </h2>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-xs text-[#a6a6a6] mr-1 hidden sm:inline">
                    Filter by HSK:
                  </span>
                  <span className="text-xs text-[#a6a6a6] mr-1 sm:hidden">
                    HSK:
                  </span>
                  {Array.from({ length: 7 }).map((_, idx) => {
                    const lvl = idx + 1;
                    const on = myLevels.includes(lvl);
                    return (
                      <button
                        key={lvl}
                        onClick={() => toggleLevel(myLevels, setMyLevels, lvl)}
                        className={`px-1.5 py-0.5 sm:px-2 rounded text-xs font-inter border cursor-pointer transition-colors duration-200 ${
                          on
                            ? "border-[#4040f2] text-[#9aa6ff] bg-[#4040f2]/10"
                            : "border-[#404040] text-[#a6a6a6]  hover:bg-[#4040f2]/10"
                        }`}
                        title={`Filter HSK ${lvl}`}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setMyLevels([])}
                    className="px-1.5 py-0.5 sm:px-2 rounded text-xs font-inter border border-[#404040] text-[#a6a6a6]  hover:bg-[#4040f2]/10 transition-colors duration-200"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {myItems.length === 0 ? (
                <p className="text-[#a6a6a6] font-inter text-sm">
                  You haven&apos;t generated any lessons yet.
                </p>
              ) : (
                <>
                  {/* My Stories */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-white font-inter font-medium">
                        My Stories
                      </h4>
                      <div
                        className="inline-flex rounded-lg border border-[#404040] overflow-hidden"
                        role="group"
                        aria-label="Filter My Stories by status"
                      >
                        <button
                          type="button"
                          onClick={() => setMyStoriesStatus("all")}
                          className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                            myStoriesStatus === "all"
                              ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                              : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                          }`}
                          aria-pressed={myStoriesStatus === "all"}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setMyStoriesStatus("finished")}
                          className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                            myStoriesStatus === "finished"
                              ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                              : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                          }`}
                          aria-pressed={myStoriesStatus === "finished"}
                        >
                          Finished
                        </button>
                        <button
                          type="button"
                          onClick={() => setMyStoriesStatus("unfinished")}
                          className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                            myStoriesStatus === "unfinished"
                              ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                              : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                          }`}
                          aria-pressed={myStoriesStatus === "unfinished"}
                        >
                          Unfinished
                        </button>
                      </div>
                    </div>
                    {myStoriesFiltered.length === 0 ? (
                      <p className="text-[#a6a6a6] font-inter text-sm">
                        No My Stories match selected HSK filters.
                      </p>
                    ) : (
                      <div className="overflow-hidden py-2">
                        <LayoutGroup>
                          <Carousel
                            containerRef={myStoriesRef}
                            onScroll={() =>
                              handleScrollPaged(
                                myStoriesRef,
                                setMyStoriesPage,
                                myStoriesRaf
                              )
                            }
                            pages={myStoriesPages}
                            pageSize={cardsPerPage}
                            padKeyPrefix="pad-ms"
                            renderItem={(l: LessonListItem | null) =>
                              l ? (
                                <LessonCard
                                  key={l.id}
                                  id={l.id}
                                  level={l.level}
                                  title={l.title as string | undefined}
                                  titleTranslation={
                                    l.titleTranslation as string | undefined
                                  }
                                  createdAt={l.createdAt}
                                  isFinished={finishedIds.has(l.id)}
                                  typeLabel="My Story"
                                  getLevelPillColor={getLevelPillColor}
                                  onClick={() =>
                                    router.push(`/lessons/${l.id}`)
                                  }
                                />
                              ) : null
                            }
                          />
                        </LayoutGroup>
                        <div className="mt-2 flex items-center justify-center gap-2">
                          {(() => {
                            const total = Math.max(
                              1,
                              Math.ceil(
                                myStoriesFiltered.length / (isMobile ? 4 : 9)
                              )
                            );
                            const goTo = (i: number) => {
                              const el = myStoriesRef.current;
                              if (!el) return;
                              el.scrollTo({
                                left: i * el.clientWidth,
                                behavior: "smooth",
                              });
                              setMyStoriesPage(i);
                            };
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    goTo(Math.max(0, myStoriesPage - 1))
                                  }
                                  disabled={myStoriesPage <= 0}
                                  aria-label="Previous page"
                                  className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                                    myStoriesPage <= 0
                                      ? "border-[#303030] text-[#555] cursor-not-allowed"
                                      : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                                  }`}
                                >
                                  ‹
                                </button>
                                {Array.from({ length: total }).map((_, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => goTo(i)}
                                    className={`w-2 h-2 rounded-full ${
                                      myStoriesPage === i
                                        ? "bg-[#9aa6ff]"
                                        : "bg-[#404040]"
                                    }`}
                                    aria-label={`Go to page ${i + 1}`}
                                  />
                                ))}
                                <button
                                  type="button"
                                  onClick={() =>
                                    goTo(Math.min(total - 1, myStoriesPage + 1))
                                  }
                                  disabled={myStoriesPage >= total - 1}
                                  aria-label="Next page"
                                  className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                                    myStoriesPage >= total - 1
                                      ? "border-[#303030] text-[#555] cursor-not-allowed"
                                      : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                                  }`}
                                >
                                  ›
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* My Dialogues */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-white font-inter font-medium">
                        My Dialogues
                      </h4>
                      <div
                        className="inline-flex rounded-lg border border-[#404040] overflow-hidden"
                        role="group"
                        aria-label="Filter My Dialogues by status"
                      >
                        <button
                          type="button"
                          onClick={() => setMyDialoguesStatus("all")}
                          className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                            myDialoguesStatus === "all"
                              ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                              : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                          }`}
                          aria-pressed={myDialoguesStatus === "all"}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setMyDialoguesStatus("finished")}
                          className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                            myDialoguesStatus === "finished"
                              ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                              : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                          }`}
                          aria-pressed={myDialoguesStatus === "finished"}
                        >
                          Finished
                        </button>
                        <button
                          type="button"
                          onClick={() => setMyDialoguesStatus("unfinished")}
                          className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                            myDialoguesStatus === "unfinished"
                              ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                              : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                          }`}
                          aria-pressed={myDialoguesStatus === "unfinished"}
                        >
                          Unfinished
                        </button>
                      </div>
                    </div>
                    {myDialoguesFiltered.length === 0 ? (
                      <p className="text-[#a6a6a6] font-inter text-sm">
                        No My Dialogues match selected HSK filters.
                      </p>
                    ) : (
                      <div className="overflow-hidden py-2">
                        <LayoutGroup>
                          <Carousel
                            containerRef={myDialoguesRef}
                            onScroll={() =>
                              handleScrollPaged(
                                myDialoguesRef,
                                setMyDialoguesPage,
                                myDialoguesRaf
                              )
                            }
                            pages={myDialoguesPages}
                            pageSize={cardsPerPage}
                            padKeyPrefix="pad-md"
                            renderItem={(l: LessonListItem | null) =>
                              l ? (
                                <LessonCard
                                  key={l.id}
                                  id={l.id}
                                  level={l.level}
                                  title={l.title as string | undefined}
                                  titleTranslation={
                                    l.titleTranslation as string | undefined
                                  }
                                  createdAt={l.createdAt}
                                  isFinished={finishedIds.has(l.id)}
                                  typeLabel="My Dialogue"
                                  getLevelPillColor={getLevelPillColor}
                                  onClick={() =>
                                    router.push(`/lessons/${l.id}`)
                                  }
                                />
                              ) : null
                            }
                          />
                        </LayoutGroup>
                        <div className="mt-2 flex items-center justify-center gap-2">
                          {(() => {
                            const total = Math.max(
                              1,
                              Math.ceil(
                                myItems.filter(
                                  (i) => i.lessonType === "dialogue"
                                ).length / (isMobile ? 4 : 9)
                              )
                            );
                            const goTo = (i: number) => {
                              const el = myDialoguesRef.current;
                              if (!el) return;
                              el.scrollTo({
                                left: i * el.clientWidth,
                                behavior: "smooth",
                              });
                              setMyDialoguesPage(i);
                            };
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    goTo(Math.max(0, myDialoguesPage - 1))
                                  }
                                  disabled={myDialoguesPage <= 0}
                                  aria-label="Previous page"
                                  className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                                    myDialoguesPage <= 0
                                      ? "border-[#303030] text-[#555] cursor-not-allowed"
                                      : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                                  }`}
                                >
                                  ‹
                                </button>
                                {Array.from({ length: total }).map((_, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => goTo(i)}
                                    className={`w-2 h-2 rounded-full ${
                                      myDialoguesPage === i
                                        ? "bg-[#9aa6ff]"
                                        : "bg-[#404040]"
                                    }`}
                                    aria-label={`Go to page ${i + 1}`}
                                  />
                                ))}
                                <button
                                  type="button"
                                  onClick={() =>
                                    goTo(
                                      Math.min(total - 1, myDialoguesPage + 1)
                                    )
                                  }
                                  disabled={myDialoguesPage >= total - 1}
                                  aria-label="Next page"
                                  className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                                    myDialoguesPage >= total - 1
                                      ? "border-[#303030] text-[#555] cursor-not-allowed"
                                      : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                                  }`}
                                >
                                  ›
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="h-px bg-[#3a3a3a]" />

            {/* Stories Section */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-white font-inter font-semibold">Stories</h3>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 w-full sm:w-auto">
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <span className="text-xs text-[#a6a6a6] mr-1 hidden sm:inline">
                      Filter by HSK:
                    </span>
                    <span className="text-xs text-[#a6a6a6] mr-1 sm:hidden">
                      HSK:
                    </span>
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const lvl = idx + 1;
                      const on = storyLevels.includes(lvl);
                      return (
                        <button
                          key={lvl}
                          onClick={() =>
                            toggleLevel(storyLevels, setStoryLevels, lvl)
                          }
                          className={`px-1.5 py-0.5 sm:px-2 rounded text-xs font-inter border cursor-pointer transition-colors duration-200 ${
                            on
                              ? "border-[#4040f2] text-[#9aa6ff] bg-[#4040f2]/10"
                              : "border-[#404040] text-[#a6a6a6]  hover:bg-[#4040f2]/10"
                          }`}
                          title={`HSK ${lvl}`}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setStoryLevels([])}
                      className="px-1.5 py-0.5 sm:px-2 rounded text-xs font-inter border border-[#404040] text-[#a6a6a6]  hover:bg-[#4040f2]/10 transition-colors duration-200"
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    className="sm:ml-2 inline-flex rounded-lg border border-[#404040] overflow-hidden self-start sm:self-auto"
                    role="group"
                    aria-label="Filter Stories by status"
                  >
                    <button
                      type="button"
                      onClick={() => setStoriesStatus("all")}
                      className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                        storiesStatus === "all"
                          ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                          : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                      }`}
                      aria-pressed={storiesStatus === "all"}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoriesStatus("finished")}
                      className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                        storiesStatus === "finished"
                          ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                          : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                      }`}
                      aria-pressed={storiesStatus === "finished"}
                    >
                      Finished
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoriesStatus("unfinished")}
                      className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                        storiesStatus === "unfinished"
                          ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                          : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                      }`}
                      aria-pressed={storiesStatus === "unfinished"}
                    >
                      Unfinished
                    </button>
                  </div>
                </div>
              </div>
              <div className="overflow-hidden py-2">
                {storiesFiltered.length === 0 ? (
                  <p className="text-[#a6a6a6] font-inter text-sm">
                    No Stories match selected HSK filters.
                  </p>
                ) : (
                  <LayoutGroup>
                    <Carousel
                      containerRef={storiesRef}
                      onScroll={() =>
                        handleScrollPaged(
                          storiesRef,
                          setStoriesPage,
                          storiesRaf
                        )
                      }
                      pages={storiesPages}
                      pageSize={cardsPerPage}
                      padKeyPrefix="pad-s"
                      renderItem={(l: LessonListItem | null) =>
                        l ? (
                          <LessonCard
                            key={l.id}
                            id={l.id}
                            level={l.level}
                            title={l.title as string | undefined}
                            titleTranslation={
                              l.titleTranslation as string | undefined
                            }
                            createdAt={l.createdAt}
                            isFinished={finishedIds.has(l.id)}
                            typeLabel="Story"
                            getLevelPillColor={getLevelPillColor}
                            onClick={() => router.push(`/lessons/${l.id}`)}
                          />
                        ) : null
                      }
                    />
                  </LayoutGroup>
                )}
                {storiesFiltered.length > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {(() => {
                      const total = Math.max(
                        1,
                        Math.ceil(storiesFiltered.length / (isMobile ? 4 : 9))
                      );
                      const goTo = (i: number) => {
                        const el = storiesRef.current;
                        if (!el) return;
                        el.scrollTo({
                          left: i * el.clientWidth,
                          behavior: "smooth",
                        });
                        setStoriesPage(i);
                      };
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => goTo(Math.max(0, storiesPage - 1))}
                            disabled={storiesPage <= 0}
                            aria-label="Previous page"
                            className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                              storiesPage <= 0
                                ? "border-[#303030] text-[#555] cursor-not-allowed"
                                : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                            }`}
                          >
                            ‹
                          </button>
                          {Array.from({ length: total }).map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => goTo(i)}
                              className={`w-2 h-2 rounded-full ${
                                storiesPage === i
                                  ? "bg-[#9aa6ff]"
                                  : "bg-[#404040]"
                              }`}
                              aria-label={`Go to page ${i + 1}`}
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              goTo(Math.min(total - 1, storiesPage + 1))
                            }
                            disabled={storiesPage >= total - 1}
                            aria-label="Next page"
                            className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                              storiesPage >= total - 1
                                ? "border-[#303030] text-[#555] cursor-not-allowed"
                                : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                            }`}
                          >
                            ›
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-[#3a3a3a]" />

            {/* Dialogues Section */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-white font-inter font-semibold">
                  Dialogues
                </h3>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 w-full sm:w-auto">
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <span className="text-xs text-[#a6a6a6] mr-1 hidden sm:inline">
                      Filter by HSK:
                    </span>
                    <span className="text-xs text-[#a6a6a6] mr-1 sm:hidden">
                      HSK:
                    </span>
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const lvl = idx + 1;
                      const on = dialogueLevels.includes(lvl);
                      return (
                        <button
                          key={lvl}
                          onClick={() =>
                            toggleLevel(dialogueLevels, setDialogueLevels, lvl)
                          }
                          className={`px-1.5 py-0.5 sm:px-2 rounded text-xs font-inter border cursor-pointer transition-colors duration-200 ${
                            on
                              ? "border-[#4040f2] text-[#9aa6ff] bg-[#4040f2]/10"
                              : "border-[#404040] text-[#a6a6a6]  hover:bg-[#4040f2]/10"
                          }`}
                          title={`HSK ${lvl}`}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setDialogueLevels([])}
                      className="px-1.5 py-0.5 sm:px-2 rounded text-xs font-inter border border-[#404040] text-[#a6a6a6]  hover:bg-[#4040f2]/10 transition-colors duration-200"
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    className="sm:ml-2 inline-flex rounded-lg border border-[#404040] overflow-hidden self-start sm:self-auto"
                    role="group"
                    aria-label="Filter Dialogues by status"
                  >
                    <button
                      type="button"
                      onClick={() => setDialoguesStatus("all")}
                      className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                        dialoguesStatus === "all"
                          ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                          : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                      }`}
                      aria-pressed={dialoguesStatus === "all"}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialoguesStatus("finished")}
                      className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                        dialoguesStatus === "finished"
                          ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                          : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                      }`}
                      aria-pressed={dialoguesStatus === "finished"}
                    >
                      Finished
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialoguesStatus("unfinished")}
                      className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                        dialoguesStatus === "unfinished"
                          ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                          : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                      }`}
                      aria-pressed={dialoguesStatus === "unfinished"}
                    >
                      Unfinished
                    </button>
                  </div>
                </div>
              </div>
              <div className="overflow-hidden py-2">
                <LayoutGroup>
                  <Carousel
                    containerRef={dialoguesRef}
                    onScroll={() =>
                      handleScrollPaged(
                        dialoguesRef,
                        setDialoguesPage,
                        dialoguesRaf
                      )
                    }
                    pages={dialoguesPages}
                    pageSize={cardsPerPage}
                    padKeyPrefix="pad-d"
                    renderItem={(l: LessonListItem | null) =>
                      l ? (
                        <LessonCard
                          key={l.id}
                          id={l.id}
                          level={l.level}
                          title={l.title as string | undefined}
                          titleTranslation={
                            l.titleTranslation as string | undefined
                          }
                          createdAt={l.createdAt}
                          isFinished={finishedIds.has(l.id)}
                          typeLabel="Dialogue"
                          getLevelPillColor={getLevelPillColor}
                          onClick={() => router.push(`/lessons/${l.id}`)}
                        />
                      ) : null
                    }
                  />
                </LayoutGroup>
                {dialoguesFiltered.length > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {(() => {
                      const totalLen = dialoguesFiltered.length;
                      const total = Math.max(
                        1,
                        Math.ceil(totalLen / (isMobile ? 4 : 9))
                      );
                      const goTo = (i: number) => {
                        const el = dialoguesRef.current;
                        if (!el) return;
                        el.scrollTo({
                          left: i * el.clientWidth,
                          behavior: "smooth",
                        });
                        setDialoguesPage(i);
                      };
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => goTo(Math.max(0, dialoguesPage - 1))}
                            disabled={dialoguesPage <= 0}
                            aria-label="Previous page"
                            className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                              dialoguesPage <= 0
                                ? "border-[#303030] text-[#555] cursor-not-allowed"
                                : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                            }`}
                          >
                            ‹
                          </button>
                          {Array.from({ length: total }).map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => goTo(i)}
                              className={`w-2 h-2 rounded-full ${
                                dialoguesPage === i
                                  ? "bg-[#9aa6ff]"
                                  : "bg-[#404040]"
                              }`}
                              aria-label={`Go to page ${i + 1}`}
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              goTo(Math.min(total - 1, dialoguesPage + 1))
                            }
                            disabled={dialoguesPage >= total - 1}
                            aria-label="Next page"
                            className={`px-2 py-1 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent ${
                              dialoguesPage >= total - 1
                                ? "border-[#303030] text-[#555] cursor-not-allowed"
                                : "border-[#404040] text-[#a6a6a6] hover:bg-[#4040f2]/10 cursor-pointer"
                            }`}
                          >
                            ›
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function LessonsPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout title="Lessons" subtitle="Loading...">
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent motion-safe:animate-spin" />
          </div>
        </DashboardLayout>
      }
    >
      <LessonsPageContent />
    </Suspense>
  );
}
