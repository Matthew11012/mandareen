"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { lessonsApi, type LessonListItem } from "@/lib/api/lessons";
import { Plus, RefreshCw, MessageSquare } from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import { useRouter } from "next/navigation";
import {
  useLessonsGenerationStore,
  type ProgressKey,
} from "@/lib/stores/lessons-generation-store";
import { useCurrentLevel } from "@/lib/hooks/use-current-level";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";

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

  const { currentLevel } = useCurrentLevel();
  const [genLevel, setGenLevel] = useState<number | null>(null);
  const cardsPerPage = isMobile ? 4 : 9;
  useEffect(() => {
    if (currentLevel && !genLevel) setGenLevel(currentLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel]);

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

  const myIdSet = new Set(myItems.map((m) => m.id));
  const myStoriesFiltered = myItems
    .filter((i) => i.lessonType === "story")
    .filter((i) => (myLevels.length > 0 ? myLevels.includes(i.level) : true))
    .filter((i) =>
      myStoriesStatus === "all"
        ? true
        : myStoriesStatus === "finished"
          ? finishedIds.has(i.id)
          : !finishedIds.has(i.id)
    );
  const myDialoguesFiltered = myItems
    .filter((i) => i.lessonType === "dialogue")
    .filter((i) => (myLevels.length > 0 ? myLevels.includes(i.level) : true))
    .filter((i) =>
      myDialoguesStatus === "all"
        ? true
        : myDialoguesStatus === "finished"
          ? finishedIds.has(i.id)
          : !finishedIds.has(i.id)
    );
  const storiesFiltered = allStories
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
    );
  const dialoguesFiltered = allDialogues
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
    );

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    setProgressOpen(true);
    genStore.start({
      level: genLevel ?? null,
      topic: topic.trim() || undefined,
      readTimeMinutes: 10,
      type: "story",
    });
    try {
      const base = (
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
      ).replace(/\/$/, "");
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("auth-token")
          : null;
      if (!token) throw new Error("No auth token");
      const params = new URLSearchParams({
        token,
        type: "story",
        readTimeMinutes: String(10),
      });
      if (genLevel) params.set("level", String(genLevel));
      if (topic.trim()) params.set("topic", topic.trim());
      const url = `${base}/lessons/generate/stream?${params.toString()}`;

      const es = new EventSource(url);
      genStore.setAttached(true);
      let streamFinished = false;
      const markComplete = (key: string) => genStore.markCompleted(key);

      const storyStepsOrder = [
        "openai_generate_story",
        "segment_story",
        "openai_generate_grammar_notes",
        "segment_grammar_notes_and_tips",
        "persist_lesson",
      ];

      const handleStepPayload = (raw: unknown) => {
        let payload: unknown = null;
        try {
          payload = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {}
        const key =
          ((payload as { key?: string } | null)?.key as string | undefined) ||
          ((payload as { data?: { key?: string } } | null)?.data?.key as
            | string
            | undefined);
        if (!key) return;
        genStore.setStep(key as ProgressKey);
        const idx = storyStepsOrder.indexOf(key);
        if (idx > 0) {
          for (let i = 0; i < idx; i++) markComplete(storyStepsOrder[i]);
        }
      };

      es.onmessage = async (e) => {
        const raw = (e as MessageEvent).data as unknown;
        handleStepPayload(raw);
        try {
          let id: number | undefined = undefined;
          if (typeof raw === "string" && raw.trim().length > 0) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.id === "number") id = parsed.id;
          } else if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { id?: unknown }).id === "number"
          ) {
            id = (raw as { id?: unknown }).id as number;
          }
          if (typeof id === "number" && !streamFinished) {
            storyStepsOrder.forEach((k) => markComplete(k));
            genStore.setStep("complete");
            genStore.setLessonId(id);
            streamFinished = true;
            es.close();
            await load();
            setProgressOpen(false);
            genStore.setLessonId(null);
            genStore.finish();
            router.push(`/lessons/${id}`);
          }
        } catch {}
      };
      es.addEventListener("queued", () => genStore.setStep("queued"));
      es.addEventListener("started", () => genStore.setStep("started"));
      es.addEventListener("step", (e: MessageEvent) =>
        handleStepPayload(e.data)
      );
      es.addEventListener("heartbeat", () => {});
      es.addEventListener("complete", async (e: MessageEvent) => {
        try {
          let id: number | undefined = undefined;
          const raw = (e as MessageEvent).data as unknown;
          if (typeof raw === "string" && raw.trim().length > 0) {
            try {
              const parsed = JSON.parse(raw);
              id =
                parsed && typeof parsed.id === "number" ? parsed.id : undefined;
            } catch {
              id = undefined;
            }
          } else if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { id?: unknown }).id === "number"
          ) {
            id = (raw as { id?: unknown }).id as number;
          }
          storyStepsOrder.forEach((k) => markComplete(k));
          genStore.setStep("complete");
          streamFinished = true;
          es.close();
          await load();
          setProgressOpen(false);
          if (id) {
            genStore.setLessonId(null);
            router.push(`/lessons/${id}`);
          }
        } catch {
          streamFinished = true;
          try {
            es.close();
          } catch {}
          setProgressOpen(false);
        } finally {
          setGenerating(false);
          genStore.finish();
        }
      });
      es.addEventListener("error", async () => {
        if (streamFinished) return;
        try {
          es.close();
        } catch {}
        try {
          await load();
          const startedAt = genStore.startedAt || Date.now();
          const startedThreshold = startedAt - 60_000;
          const recentMine = myItems
            .filter((i) => i.lessonType === "story")
            .filter((i) => new Date(i.createdAt).getTime() >= startedThreshold)
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
          if (recentMine.length > 0) {
            streamFinished = true;
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
      });
    } catch {
      // Fallback to non-stream API
      try {
        const { id } = await lessonsApi.generate({
          type: "story",
          readTimeMinutes: 10,
          level: genLevel ?? undefined,
          topic: topic.trim() || undefined,
        });
        await load();
        genStore.setLessonId(id);
        router.push(`/lessons/${id}`);
      } catch {
        setError("Failed to generate lesson");
      } finally {
        setGenerating(false);
        setProgressOpen(false);
        genStore.finish();
      }
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
    genStore.start({
      level: genLevel ?? null,
      topic: topic.trim() || undefined,
      readTimeMinutes: 8,
      type: "dialogue",
    });
    try {
      const base = (
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
      ).replace(/\/$/, "");
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("auth-token")
          : null;
      if (!token) throw new Error("No auth token");
      const params = new URLSearchParams({
        token,
        type: "dialogue",
        readTimeMinutes: String(5),
      });
      if (genLevel) params.set("level", String(genLevel));
      if (topic.trim()) params.set("topic", topic.trim());
      const url = `${base}/lessons/generate/stream?${params.toString()}`;

      const es = new EventSource(url);
      genStore.setAttached(true);
      let streamFinished = false; // guard to ignore spurious errors after completion
      const markComplete = (key: string) => genStore.markCompleted(key);

      const handleStepPayload = (raw: unknown) => {
        let payload: unknown = null;
        try {
          payload = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {}
        // Support { key } or { data: { key } }
        const key =
          ((payload as { key?: string } | null)?.key as string | undefined) ||
          ((payload as { data?: { key?: string } } | null)?.data?.key as
            | string
            | undefined);
        if (!key) return;
        genStore.setStep(key as ProgressKey);
        const idx = progressStepsOrder.indexOf(key);
        if (idx > 0) {
          for (let i = 0; i < idx; i++) markComplete(progressStepsOrder[i]);
        }
      };

      // Support both typed events and default message events
      es.onmessage = async (e) => {
        const raw = (e as MessageEvent).data as unknown;
        // First, try to handle as a step payload
        handleStepPayload(raw);
        // If not a step, also check if this looks like a completion payload
        try {
          let id: number | undefined = undefined;
          if (typeof raw === "string" && raw.trim().length > 0) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.id === "number") id = parsed.id;
          } else if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { id?: unknown }).id === "number"
          ) {
            id = (raw as { id?: unknown }).id as number;
          }
          if (typeof id === "number" && !streamFinished) {
            progressStepsOrder.forEach((k) => markComplete(k));
            genStore.setStep("complete");
            genStore.setLessonId(id);
            streamFinished = true;
            es.close();
            await load();
            setProgressOpen(false);
            genStore.setLessonId(null);
            genStore.finish();
            router.push(`/lessons/${id}`);
          }
        } catch {
          // ignore
        }
      };
      es.addEventListener("queued", () => genStore.setStep("queued"));
      es.addEventListener("started", () => genStore.setStep("started"));
      es.addEventListener("step", (e: MessageEvent) =>
        handleStepPayload(e.data)
      );
      es.addEventListener("heartbeat", () => {
        // no-op, used to keep connection alive
      });
      es.addEventListener("complete", async (e: MessageEvent) => {
        try {
          let id: number | undefined = undefined;
          const raw = (e as MessageEvent).data as unknown;
          if (typeof raw === "string" && raw.trim().length > 0) {
            try {
              const parsed = JSON.parse(raw);
              id =
                parsed && typeof parsed.id === "number" ? parsed.id : undefined;
            } catch {
              id = undefined;
            }
          } else if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { id?: unknown }).id === "number"
          ) {
            id = (raw as { id?: unknown }).id as number;
          }
          progressStepsOrder.forEach((k) => markComplete(k));
          genStore.setStep("complete");
          streamFinished = true;
          es.close();
          await load();
          setProgressOpen(false);
          if (id) {
            genStore.setLessonId(null);
            router.push(`/lessons/${id}`);
          }
        } catch {
          // Do not surface an error here; treat as completed without redirect
          streamFinished = true;
          try {
            es.close();
          } catch {}
          setProgressOpen(false);
        } finally {
          setGenerating(false);
          genStore.finish();
        }
      });
      es.addEventListener("error", async () => {
        if (streamFinished) return; // ignore errors after completion/close
        try {
          es.close();
        } catch {}
        // Fallback: try to locate the newly created lesson since backend may have completed successfully
        try {
          await load();
          const startedAt = genStore.startedAt || Date.now();
          const startedThreshold = startedAt - 60_000; // 1 minute grace
          // Prefer my items and dialogues only
          const recentMine = myItems
            .filter((i) => i.lessonType === "dialogue")
            .filter((i) => {
              const ts = new Date(i.createdAt).getTime();
              return ts >= startedThreshold;
            })
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
          if (recentMine.length > 0) {
            streamFinished = true;
            setProgressOpen(false);
            setGenerating(false);
            genStore.finish();
            router.push(`/lessons/${recentMine[0].id}`);
            return;
          }
        } catch {
          // ignore and fall through to error UI
        }
        setError("Generation failed");
        setGenerating(false);
        setProgressOpen(false);
        genStore.finish();
      });

      // Do not auto-close the SSE; let backend signal completion or error.
    } catch {
      try {
        const { id } = await lessonsApi.generate({
          type: "dialogue",
          readTimeMinutes: 5,
          level: genLevel ?? undefined,
          topic: topic.trim() || undefined,
        });
        await load();
        genStore.setLessonId(id);
        router.push(`/lessons/${id}`);
      } catch {
        setError("Failed to generate dialogue");
      } finally {
        setGenerating(false);
        setProgressOpen(false);
        genStore.finish();
      }
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
          <div className="sticky top-2 z-30 mb-4">
            <motion.div
              className="relative rounded-xl px-4 py-3 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))",
              }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl"
                style={{
                  background:
                    "radial-gradient(1200px 300px at -10% -50%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 60%, transparent 80%)",
                  maskImage:
                    "linear-gradient(to bottom, black, transparent 85%)",
                }}
                animate={{ backgroundPosition: ["0% 0%", "120% 0%"] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="font-inter font-semibold">
                  Generating lesson…
                </div>
                <div className="text-xs text-white/70">
                  This can take up to several minutes
                </div>
              </div>
              <ol className="relative mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(genStore.params?.readTimeMinutes === 10
                  ? [
                      "openai_generate_story",
                      "segment_story",
                      "openai_generate_grammar_notes",
                      "segment_grammar_notes_and_tips",
                      "persist_lesson",
                    ]
                  : progressStepsOrder
                ).map((k) => {
                  const active = progressStep === k;
                  const done = !!completedSteps[k];
                  return (
                    <li key={k} className="flex items-center gap-2 text-xs">
                      <div
                        className={`h-3 w-3 rounded-full border backdrop-blur-sm ${
                          done
                            ? "bg-emerald-400/80 border-emerald-300/60 shadow-[0_0_10px_rgba(74,222,128,0.6)]"
                            : active
                              ? "border-white/80 motion-safe:animate-pulse"
                              : "border-white/30"
                        }`}
                      />
                      <span>
                        {k === "openai_generate_dialogue" &&
                          "Generating dialogue"}
                        {k === "openai_generate_story" && "Generating story"}
                        {k === "segment_dialogue" &&
                          "Analyzing & segmenting dialogue"}
                        {k === "segment_story" &&
                          "Analyzing & segmenting story"}
                        {k === "rag_retrieve_context" &&
                          "Retrieving grammar context"}
                        {k === "openai_generate_grammar_notes" &&
                          "Generating grammar notes"}
                        {k === "segment_grammar_notes_and_tips" &&
                          "Segmenting notes & tips"}
                        {k === "persist_lesson" && "Saving lesson"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </motion.div>
          </div>
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
            <div className="text-white font-inter font-semibold mb-2 text-sm">
              HSK Level
            </div>
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {Array.from({ length: 7 }).map((_, idx) => {
                const lvl = idx + 1;
                const active = genLevel === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => setGenLevel(active ? null : lvl)}
                    className={`px-2 py-1 sm:px-3 rounded-full text-xs sm:text-xs font-inter border ${
                      active
                        ? "border-[#4040f2] text-[#9aa6ff]"
                        : "border-[#404040] text-[#a6a6a6]"
                    } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]`}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Set HSK level ${lvl}`}
                  >
                    HSK {lvl}
                  </button>
                );
              })}
              <button
                onClick={() => setGenLevel(null)}
                className="px-2 py-1 sm:px-3 rounded-full text-xs sm:text-xs font-inter border border-[#404040] text-[#a6a6a6] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]"
                type="button"
                aria-label="Use auto level (my level)"
              >
                Auto (my level)
              </button>
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
                <h3 className="text-white font-inter font-semibold">
                  My Lessons
                </h3>
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
                          <div
                            ref={myStoriesRef}
                            onScroll={() => {
                              const el = myStoriesRef.current;
                              if (!el) return;
                              const idx = Math.round(
                                el.scrollLeft / el.clientWidth
                              );
                              if (idx !== myStoriesPage) setMyStoriesPage(idx);
                            }}
                            className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide"
                          >
                            <AnimatePresence mode="popLayout">
                              {myStoriesFiltered
                                .reduce(
                                  (
                                    pages: LessonListItem[][],
                                    item: LessonListItem,
                                    idx: number
                                  ) => {
                                    const pageIdx = Math.floor(
                                      idx / cardsPerPage
                                    );
                                    if (!pages[pageIdx]) pages[pageIdx] = [];
                                    pages[pageIdx].push(item);
                                    return pages;
                                  },
                                  []
                                )
                                .map((page, i) => {
                                  const padCount = Math.max(
                                    0,
                                    cardsPerPage - page.length
                                  );
                                  const padded = [
                                    ...page,
                                    ...Array(padCount).fill(null),
                                  ];
                                  return (
                                    <motion.div
                                      key={i}
                                      layout
                                      className="min-w-full snap-start flex items-stretch"
                                    >
                                      <div
                                        className={`${page.length >= (isMobile ? 4 : 9) ? "flex-none w-3 sm:w-4 md:w-5" : "flex-none w-0"}`}
                                        aria-hidden="true"
                                      />
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                                        <AnimatePresence mode="popLayout">
                                          {padded.map(
                                            (l: LessonListItem | null, idx2) =>
                                              l ? (
                                                <motion.div
                                                  key={l.id}
                                                  layout
                                                  initial={{
                                                    opacity: 0,
                                                    scale: 0.8,
                                                    y: 20,
                                                  }}
                                                  animate={{
                                                    opacity: 1,
                                                    scale: 1,
                                                    y: 0,
                                                    borderColor: "#404040",
                                                  }}
                                                  exit={{
                                                    opacity: 0,
                                                    scale: 0.8,
                                                    y: -20,
                                                  }}
                                                  transition={{
                                                    duration: 0.3,
                                                    delay: idx2 * 0.05,
                                                    layout: { duration: 0.4 },
                                                  }}
                                                  className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]  cursor-pointer"
                                                  onClick={() =>
                                                    router.push(
                                                      `/lessons/${l.id}`
                                                    )
                                                  }
                                                  whileHover={{
                                                    scale: 1.02,
                                                    borderColor: "#4040f2",
                                                  }}
                                                  whileTap={{ scale: 0.98 }}
                                                >
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                      {finishedIds.has(l.id) ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-500 text-[11px] font-inter bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                                          <svg
                                                            className="w-3 h-3"
                                                            viewBox="0 0 20 20"
                                                            fill="currentColor"
                                                            aria-hidden="true"
                                                          >
                                                            <path
                                                              fillRule="evenodd"
                                                              d="M16.707 5.293a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L3.293 9.85a1 1 0 111.414-1.414l3.182 3.182 6.364-6.364a1 1 0 011.414 0z"
                                                              clipRule="evenodd"
                                                            />
                                                          </svg>
                                                          Finished
                                                        </span>
                                                      ) : (
                                                        <span />
                                                      )}
                                                      <span
                                                        className={`px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                                      >
                                                        HSK {l.level}
                                                      </span>
                                                    </div>
                                                    <p className="text-white font-inter font-semibold truncate mt-1">
                                                      {l.title ||
                                                        `Lesson #${l.id}`}
                                                    </p>
                                                    {l.titlePinyin && (
                                                      <p className="text-[#9aa6ff] font-inter text-xs truncate hidden sm:block">
                                                        {l.titlePinyin}
                                                      </p>
                                                    )}
                                                    {l.titleTranslation && (
                                                      <p className="text-[#a6a6a6] font-inter text-xs truncate line-clamp-1">
                                                        {l.titleTranslation}
                                                      </p>
                                                    )}
                                                    <div className="mt-2 pt-2 border-t border-[#404040] flex items-center justify-between text-[11px] text-[#8b949e]">
                                                      <span>
                                                        {new Date(l.createdAt)
                                                          .toISOString()
                                                          .slice(0, 10)}
                                                      </span>
                                                      <span className="text-[#a6a6a6]">
                                                        My Story
                                                      </span>
                                                    </div>
                                                  </div>
                                                </motion.div>
                                              ) : (
                                                <div
                                                  key={`pad-ms-${idx2}`}
                                                  className="invisible bg-[#2e323a] rounded-xl p-4 border border-[#404040]"
                                                />
                                              )
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                            </AnimatePresence>
                          </div>
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
                          <div
                            ref={myDialoguesRef}
                            onScroll={() => {
                              const el = myDialoguesRef.current;
                              if (!el) return;
                              const idx = Math.round(
                                el.scrollLeft / el.clientWidth
                              );
                              if (idx !== myDialoguesPage)
                                setMyDialoguesPage(idx);
                            }}
                            className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide"
                          >
                            <AnimatePresence mode="popLayout">
                              {myDialoguesFiltered
                                .reduce(
                                  (
                                    pages: LessonListItem[][],
                                    item: LessonListItem,
                                    idx: number
                                  ) => {
                                    const pageIdx = Math.floor(
                                      idx / cardsPerPage
                                    );
                                    if (!pages[pageIdx]) pages[pageIdx] = [];
                                    pages[pageIdx].push(item);
                                    return pages;
                                  },
                                  []
                                )
                                .map((page, i) => {
                                  const padCount = Math.max(
                                    0,
                                    cardsPerPage - page.length
                                  );
                                  const padded = [
                                    ...page,
                                    ...Array(padCount).fill(null),
                                  ];
                                  return (
                                    <motion.div
                                      key={i}
                                      layout
                                      className="min-w-full snap-start flex items-stretch"
                                    >
                                      <div
                                        className={`${page.length >= (isMobile ? 4 : 9) ? "flex-none w-3 sm:w-4 md:w-5" : "flex-none w-0"}`}
                                        aria-hidden="true"
                                      />
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                                        <AnimatePresence mode="popLayout">
                                          {padded.map(
                                            (l: LessonListItem | null, idx2) =>
                                              l ? (
                                                <motion.div
                                                  key={l.id}
                                                  layout
                                                  initial={{
                                                    opacity: 0,
                                                    scale: 0.8,
                                                    y: 20,
                                                  }}
                                                  animate={{
                                                    opacity: 1,
                                                    scale: 1,
                                                    y: 0,
                                                    borderColor: "#404040",
                                                  }}
                                                  exit={{
                                                    opacity: 0,
                                                    scale: 0.8,
                                                    y: -20,
                                                  }}
                                                  transition={{
                                                    duration: 0.3,
                                                    delay: idx2 * 0.05,
                                                    layout: { duration: 0.4 },
                                                  }}
                                                  className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]  cursor-pointer"
                                                  onClick={() =>
                                                    router.push(
                                                      `/lessons/${l.id}`
                                                    )
                                                  }
                                                  whileHover={{
                                                    scale: 1.02,
                                                    borderColor: "#4040f2",
                                                  }}
                                                  whileTap={{ scale: 0.98 }}
                                                >
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                      {finishedIds.has(l.id) ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-500 text-[11px] font-inter bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                                          <svg
                                                            className="w-3 h-3"
                                                            viewBox="0 0 20 20"
                                                            fill="currentColor"
                                                            aria-hidden="true"
                                                          >
                                                            <path
                                                              fillRule="evenodd"
                                                              d="M16.707 5.293a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L3.293 9.85a1 1 0 111.414-1.414l3.182 3.182 6.364-6.364a1 1 0 011.414 0z"
                                                              clipRule="evenodd"
                                                            />
                                                          </svg>
                                                          Finished
                                                        </span>
                                                      ) : (
                                                        <span />
                                                      )}

                                                      <span
                                                        className={`px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                                      >
                                                        HSK {l.level}
                                                      </span>
                                                    </div>
                                                    <p className="text-white font-inter font-semibold truncate mt-1">
                                                      {l.title ||
                                                        `Dialogue #${l.id}`}
                                                    </p>
                                                    {l.titlePinyin && (
                                                      <p className="text-[#9aa6ff] font-inter text-xs truncate hidden sm:block">
                                                        {l.titlePinyin}
                                                      </p>
                                                    )}
                                                    {l.titleTranslation && (
                                                      <p className="text-[#a6a6a6] font-inter text-xs truncate line-clamp-1">
                                                        {l.titleTranslation}
                                                      </p>
                                                    )}
                                                    <div className="mt-2 pt-2 border-t border-[#404040] flex items-center justify-between text-[11px] text-[#8b949e]">
                                                      <span>
                                                        {new Date(l.createdAt)
                                                          .toISOString()
                                                          .slice(0, 10)}
                                                      </span>
                                                      <span className="text-[#a6a6a6]">
                                                        My Dialogue
                                                      </span>
                                                    </div>
                                                  </div>
                                                </motion.div>
                                              ) : (
                                                <div
                                                  key={`pad-md-${idx2}`}
                                                  className="invisible bg-[#2e323a] rounded-xl p-4 border border-[#404040]"
                                                />
                                              )
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                            </AnimatePresence>
                          </div>
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
                    <div
                      ref={storiesRef}
                      onScroll={() => {
                        const el = storiesRef.current;
                        if (!el) return;
                        const idx = Math.round(el.scrollLeft / el.clientWidth);
                        if (idx !== storiesPage) setStoriesPage(idx);
                      }}
                      className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide"
                    >
                      <AnimatePresence mode="popLayout">
                        {storiesFiltered
                          .reduce(
                            (
                              pages: LessonListItem[][],
                              item: LessonListItem,
                              idx: number
                            ) => {
                              const pageIdx = Math.floor(idx / cardsPerPage);
                              if (!pages[pageIdx]) pages[pageIdx] = [];
                              pages[pageIdx].push(item);
                              return pages;
                            },
                            []
                          )
                          .map((page, i) => {
                            const padCount = Math.max(
                              0,
                              cardsPerPage - page.length
                            );
                            const padded = [
                              ...page,
                              ...Array(padCount).fill(null),
                            ];
                            return (
                              <motion.div
                                key={i}
                                layout
                                className="min-w-full snap-start flex items-stretch"
                              >
                                <div
                                  className={`${page.length >= 9 ? "flex-none w-3 sm:w-4 md:w-5" : "flex-none w-0"}`}
                                  aria-hidden="true"
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                                  <AnimatePresence mode="popLayout">
                                    {padded.map(
                                      (l: LessonListItem | null, idx2) =>
                                        l ? (
                                          <motion.div
                                            key={l.id}
                                            layout
                                            initial={{
                                              opacity: 0,
                                              scale: 0.8,
                                              y: 20,
                                            }}
                                            animate={{
                                              opacity: 1,
                                              scale: 1,
                                              y: 0,
                                              borderColor: "#404040",
                                            }}
                                            exit={{
                                              opacity: 0,
                                              scale: 0.8,
                                              y: -20,
                                            }}
                                            transition={{
                                              duration: 0.3,
                                              delay: idx2 * 0.05,
                                              layout: { duration: 0.4 },
                                            }}
                                            className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]  cursor-pointer"
                                            onClick={() =>
                                              router.push(`/lessons/${l.id}`)
                                            }
                                            whileHover={{
                                              scale: 1.02,
                                              borderColor: "#4040f2",
                                            }}
                                            whileTap={{ scale: 0.98 }}
                                          >
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center justify-between gap-2">
                                                {finishedIds.has(l.id) ? (
                                                  <span className="inline-flex items-center gap-1 text-emerald-500 text-[11px] font-inter bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                                    <svg
                                                      className="w-3 h-3"
                                                      viewBox="0 0 20 20"
                                                      fill="currentColor"
                                                      aria-hidden="true"
                                                    >
                                                      <path
                                                        fillRule="evenodd"
                                                        d="M16.707 5.293a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L3.293 9.85a1 1 0 111.414-1.414l3.182 3.182 6.364-6.364a1 1 0 011.414 0z"
                                                        clipRule="evenodd"
                                                      />
                                                    </svg>
                                                    Finished
                                                  </span>
                                                ) : (
                                                  <span />
                                                )}
                                                <span
                                                  className={`px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                                >
                                                  HSK {l.level}
                                                </span>
                                              </div>
                                              <p className="text-white font-inter font-semibold truncate mt-1">
                                                {l.title || `Lesson #${l.id}`}
                                              </p>
                                              {l.titlePinyin && (
                                                <p className="text-[#9aa6ff] font-inter text-xs truncate hidden sm:block">
                                                  {l.titlePinyin}
                                                </p>
                                              )}
                                              {l.titleTranslation && (
                                                <p className="text-[#a6a6a6] font-inter text-xs truncate line-clamp-1">
                                                  {l.titleTranslation}
                                                </p>
                                              )}
                                              <div className="mt-2 pt-2 border-t border-[#404040] flex items-center justify-between text-[11px] text-[#8b949e]">
                                                <span>
                                                  {new Date(l.createdAt)
                                                    .toISOString()
                                                    .slice(0, 10)}
                                                </span>
                                                <span className="text-[#a6a6a6]">
                                                  Story
                                                </span>
                                              </div>
                                            </div>
                                          </motion.div>
                                        ) : (
                                          <div
                                            key={`pad-s-${idx2}`}
                                            className="invisible bg-[#2e323a] rounded-xl p-4 border border-[#404040]"
                                          />
                                        )
                                    )}
                                  </AnimatePresence>
                                </div>
                              </motion.div>
                            );
                          })}
                      </AnimatePresence>
                    </div>
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
                  <div
                    ref={dialoguesRef}
                    onScroll={() => {
                      const el = dialoguesRef.current;
                      if (!el) return;
                      const idx = Math.round(el.scrollLeft / el.clientWidth);
                      if (idx !== dialoguesPage) setDialoguesPage(idx);
                    }}
                    className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide"
                  >
                    <AnimatePresence mode="popLayout">
                      {dialoguesFiltered
                        .reduce(
                          (
                            pages: LessonListItem[][],
                            item: LessonListItem,
                            idx: number
                          ) => {
                            const pageIdx = Math.floor(
                              idx / (isMobile ? 4 : 9)
                            );
                            if (!pages[pageIdx]) pages[pageIdx] = [];
                            pages[pageIdx].push(item);
                            return pages;
                          },
                          []
                        )
                        .map((page, i) => {
                          const padCount = Math.max(
                            0,
                            (isMobile ? 4 : 9) - page.length
                          );
                          const padded = [
                            ...page,
                            ...Array(padCount).fill(null),
                          ];
                          return (
                            <motion.div
                              key={i}
                              layout
                              className="min-w-full snap-start flex items-stretch"
                            >
                              <div
                                className={`${page.length >= (isMobile ? 4 : 9) ? "flex-none w-3 sm:w-4 md:w-5" : "flex-none w-0"}`}
                                aria-hidden="true"
                              />
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                                <AnimatePresence mode="popLayout">
                                  {padded.map(
                                    (l: LessonListItem | null, idx2) =>
                                      l ? (
                                        <motion.div
                                          key={l.id}
                                          layout
                                          initial={{
                                            opacity: 0,
                                            scale: 0.8,
                                            y: 20,
                                          }}
                                          animate={{
                                            opacity: 1,
                                            scale: 1,
                                            y: 0,
                                            borderColor: "#404040",
                                          }}
                                          exit={{
                                            opacity: 0,
                                            scale: 0.8,
                                            y: -20,
                                          }}
                                          transition={{
                                            duration: 0.3,
                                            delay: idx2 * 0.05,
                                            layout: { duration: 0.4 },
                                          }}
                                          className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]  cursor-pointer"
                                          onClick={() =>
                                            router.push(`/lessons/${l.id}`)
                                          }
                                          whileHover={{
                                            scale: 1.02,
                                            borderColor: "#4040f2",
                                          }}
                                          whileTap={{ scale: 0.98 }}
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                              {finishedIds.has(l.id) ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-500 text-[11px] font-inter bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                                  <svg
                                                    className="w-3 h-3"
                                                    viewBox="0 0 20 20"
                                                    fill="currentColor"
                                                    aria-hidden="true"
                                                  >
                                                    <path
                                                      fillRule="evenodd"
                                                      d="M16.707 5.293a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L3.293 9.85a1 1 0 111.414-1.414l3.182 3.182 6.364-6.364a1 1 0 011.414 0z"
                                                      clipRule="evenodd"
                                                    />
                                                  </svg>
                                                  Finished
                                                </span>
                                              ) : (
                                                <span />
                                              )}
                                              <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                              >
                                                HSK {l.level}
                                              </span>
                                            </div>
                                            <p className="text-white font-inter font-semibold truncate mt-1">
                                              {l.title || `Dialogue #${l.id}`}
                                            </p>
                                            {l.titlePinyin && (
                                              <p className="text-[#9aa6ff] font-inter text-xs truncate hidden sm:block">
                                                {l.titlePinyin}
                                              </p>
                                            )}
                                            {l.titleTranslation && (
                                              <p className="text-[#a6a6a6] font-inter text-xs truncate line-clamp-1">
                                                {l.titleTranslation}
                                              </p>
                                            )}
                                            <div className="mt-2 pt-2 border-t border-[#404040] flex items-center justify-between text-[11px] text-[#8b949e]">
                                              <span>
                                                {new Date(l.createdAt)
                                                  .toISOString()
                                                  .slice(0, 10)}
                                              </span>
                                              <span className="text-[#a6a6a6]">
                                                Dialogue
                                              </span>
                                            </div>
                                          </div>
                                        </motion.div>
                                      ) : (
                                        <div
                                          key={`pad-d-${idx2}`}
                                          className="invisible bg-[#2e323a] rounded-xl p-4 border border-[#404040]"
                                        />
                                      )
                                  )}
                                </AnimatePresence>
                              </div>
                            </motion.div>
                          );
                        })}
                    </AnimatePresence>
                  </div>
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
