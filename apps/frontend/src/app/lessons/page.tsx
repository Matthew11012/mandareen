"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { lessonsApi, type LessonListItem } from "@/lib/api/lessons";
import { Plus, RefreshCw, MessageSquare } from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import { useRouter } from "next/navigation";
import { useLessonsGenerationStore } from "@/lib/stores/lessons-generation-store";
import { useLessonGenerationStream } from "@/lib/hooks/use-lesson-generation-stream";
import { LayoutGroup } from "framer-motion";
import { ProgressBanner } from "@/components/lessons/ProgressBanner";
import { LessonCard } from "@/components/lessons/LessonCard";
import { Carousel } from "@/components/lessons/Carousel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function LessonsPage() {
  const { isLoading: authLoading } = useRequireAuth();
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
  const suggestions = [
    "At the market",
    "First day at university",
    "Ordering food at a restaurant",
    "Job interview",
    "Traveling on the subway",
    "Visiting the doctor",
  ];

  const [finishedIds, setFinishedIds] = useState<Set<number>>(new Set());

  // Per-section finished status filters
  type StatusFilter = "all" | "finished" | "unfinished";
  const [myStoriesStatus, setMyStoriesStatus] = useState<StatusFilter>("all");
  const [myDialoguesStatus, setMyDialoguesStatus] =
    useState<StatusFilter>("all");
  const [storiesStatus, setStoriesStatus] = useState<StatusFilter>("all");
  const [dialoguesStatus, setDialoguesStatus] = useState<StatusFilter>("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allData, mineData, finished] = await Promise.all([
        lessonsApi.list(),
        lessonsApi.listMine(),
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
    }
  };

  const getLevelPillColor = (level: number) => getHSKPillClasses(level);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

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

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    setProgressOpen(true);
    startStream({
      level: genLevel ?? null,
      topic: topic.trim() || undefined,
      readTimeMinutes: 10,
      type: "story",
      timeframe,
    });
    try {
      await attachStream({
        params: {
          level: genLevel ?? null,
          topic: topic.trim() || undefined,
          readTimeMinutes: 10,
          type: "story",
          timeframe,
        },
        onComplete: async (id?: number) => {
          await load();
          setProgressOpen(false);
          if (id) {
            genStore.setLessonId(null);
            genStore.finish();
            router.push(`/lessons/${id}`);
          }
        },
        onError: async () => {
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
              setProgressOpen(false);
              setGenerating(false);
              genStore.finish();
              router.push(`/lessons/${recentMine[0].id}`);
              return;
            }
          } catch {}
          setError("Failed to generate lesson");
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
    } catch {
      setError("Failed to generate lesson");
      setGenerating(false);
      setProgressOpen(false);
      genStore.finish();
    }
  };

  const genStore = useLessonsGenerationStore();
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

  const handleGenerateDialogue = async () => {
    setError(null);
    setGenerating(true);
    setProgressOpen(true);
    startStream({
      level: genLevel ?? null,
      topic: topic.trim() || undefined,
      readTimeMinutes: 8,
      type: "dialogue",
      timeframe,
    });
    try {
      await attachStream({
        params: {
          level: genLevel ?? null,
          topic: topic.trim() || undefined,
          readTimeMinutes: 8,
          type: "dialogue",
          timeframe,
        },
        onComplete: async (id?: number) => {
          await load();
          setProgressOpen(false);
          if (id) {
            genStore.setLessonId(null);
            router.push(`/lessons/${id}`);
          }
          setGenerating(false);
          genStore.finish();
        },
        onError: async () => {
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
              setProgressOpen(false);
              setGenerating(false);
              genStore.finish();
              router.push(`/lessons/${recentMine[0].id}`);
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

  // Reattach on mount if generation is underway: avoid starting a new SSE; poll for completion
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const reattach = async () => {
      if (!genStore.inProgress) return;
      const params = genStore.params;
      const startedAt = genStore.startedAt || 0;
      if (!params || Date.now() - startedAt > 10 * 60 * 1000) {
        genStore.reset();
        setProgressOpen(false);
        return;
      }
      setProgressOpen(true);
      const poll = async () => {
        if (!genStore.inProgress) {
          if (interval) clearInterval(interval);
          return;
        }
        try {
          const createdAfter = startedAt - 60_000;
          const type = params.readTimeMinutes === 10 ? "story" : "dialogue";
          const mineData = await lessonsApi.listMine();
          const candidates = mineData
            .filter((i) => i.lessonType === type)
            .filter((i) => new Date(i.createdAt).getTime() >= createdAfter)
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
          if (candidates.length > 0) {
            const id = candidates[0].id;
            genStore.setLessonId(null);
            genStore.finish();
            setProgressOpen(false);
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            router.push(`/lessons/${id}`);
          }
        } catch {}
      };
      await poll();
      interval = setInterval(poll, 5000);
    };
    reattach();
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [genStore, router]);

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
            Choose a topic (optional)
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setTopic(s)}
                className={`px-3 py-1 rounded-full text-xs font-inter border ${topic === s ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]`}
                type="button"
                aria-pressed={topic === s}
                aria-label={`Use topic ${s}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              className="flex-1 bg-transparent border border-[#404040] rounded-lg px-3 py-2 text-white placeholder-[#777] focus:outline-none focus:border-[#4040f2]"
              placeholder="Or type your own detailed topic or prompt..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              name="lesson-topic"
              autoComplete="off"
            />
          </div>
          <div className="pt-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-white font-inter font-semibold mb-2 text-sm">
                  HSK Level
                </div>
                <Select
                  value={genLevel?.toString() || "auto"}
                  onValueChange={(value) =>
                    setGenLevel(value === "auto" ? null : parseInt(value))
                  }
                >
                  <SelectTrigger className="w-full bg-transparent border-[#404040] text-white">
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
                <div className="text-white font-inter font-semibold mb-2 text-sm">
                  Timeframe
                </div>
                <Select
                  value={timeframe}
                  onValueChange={(value) =>
                    setTimeframe(value as typeof timeframe)
                  }
                >
                  <SelectTrigger className="w-full bg-transparent border-[#404040] text-white">
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
            </div>
          </div>
        </div>

        <div className="flex flex-row items-start sm:items-center gap-3 justify-between">
          <div className="flex flex-row items-start sm:items-center gap-2 sm:gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-2 sm:px-4 bg-orange-500/70 text-white rounded-lg hover:bg-orange-600/70 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[#222831]"
              type="button"
              aria-label="Generate story lesson"
            >
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Plus className="hidden sm:block w-4 h-4" aria-hidden="true" />
                <span className="font-inter text-sm sm:text-base">
                  Generate Story
                </span>
              </div>
            </button>
            <button
              onClick={handleGenerateDialogue}
              disabled={generating}
              className="px-3 py-2 sm:px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-400 focus-visible:ring-offset-[#222831]"
              type="button"
              aria-label="Generate dialogue lesson"
            >
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <MessageSquare
                  className="hidden sm:block w-4 h-4"
                  aria-hidden="true"
                />
                <span className="font-inter text-sm sm:text-base">
                  Generate Dialogue
                </span>
              </div>
            </button>
            <button
              onClick={() => setTopic("")}
              disabled={generating}
              className="px-3 py-2 sm:px-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-400 focus-visible:ring-offset-[#222831]"
              type="button"
              aria-label="Clear topic"
            >
              <span className="font-inter text-sm sm:text-base">Clear</span>
            </button>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 hover:bg-orange-500/20 rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed sm:ml-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 focus-visible:ring-offset-[#222831]"
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
          <div
            className="flex items-center gap-2 text-[#a6a6a6]"
            aria-live="polite"
          >
            <div className="w-4 h-4 motion-safe:animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="font-inter text-sm">Loading...</span>
          </div>
        ) : allStories.length === 0 &&
          allDialogues.length === 0 &&
          myItems.length === 0 ? (
          <div className="text-[#a6a6a6] font-inter text-sm">
            No lessons yet. Click &quot;Generate Story&quot; to create one.
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
