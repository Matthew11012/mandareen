"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { lessonsApi, type LessonListItem } from "@/lib/api/lessons";
import { Plus, RefreshCw, BookOpen, MessageSquare } from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import { useRouter } from "next/navigation";
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allData, mineData] = await Promise.all([
        lessonsApi.list(),
        lessonsApi.listMine(),
      ]);
      setMyItems(mineData);
      setAllStories(allData.filter((i) => i.lessonType === "story"));
      setAllDialogues(allData.filter((i) => i.lessonType === "dialogue"));
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
    .filter((i) => (myLevels.length > 0 ? myLevels.includes(i.level) : true));
  const myDialoguesFiltered = myItems
    .filter((i) => i.lessonType === "dialogue")
    .filter((i) => (myLevels.length > 0 ? myLevels.includes(i.level) : true));
  const storiesFiltered = allStories
    .filter((i) => !myIdSet.has(i.id))
    .filter((i) =>
      storyLevels.length > 0 ? storyLevels.includes(i.level) : true
    );

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { id } = await lessonsApi.generate({
        type: "story",
        readTimeMinutes: 10,
        level: genLevel ?? undefined,
        topic: topic.trim() || undefined,
      });
      await load();
      router.push(`/lessons/${id}`);
    } catch {
      setError("Failed to generate lesson");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateDialogue = async () => {
    setGenerating(true);
    try {
      const { id } = await lessonsApi.generate({
        type: "dialogue",
        readTimeMinutes: 5,
        level: genLevel ?? undefined,
        topic: topic.trim() || undefined,
      });
      await load();
      router.push(`/lessons/${id}`);
    } catch {
      setError("Failed to generate dialogue");
    } finally {
      setGenerating(false);
    }
  };

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
      <div className="p-6 space-y-6">
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
                <MessageSquare className="hidden sm:block w-4 h-4" aria-hidden="true" />
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
                    <h4 className="text-white font-inter font-medium">
                      My Stories
                    </h4>
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
                                                  <div className="flex items-start gap-3">
                                                    <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                                                      <BookOpen className="w-5 h-5 text-orange-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <div className="flex items-center justify-between gap-2">
                                                        <p className="text-white font-inter font-semibold truncate">
                                                          {l.title ||
                                                            `Lesson #${l.id}`}
                                                        </p>
                                                        <span
                                                          className={`ml-2 px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                                        >
                                                          HSK {l.level}
                                                        </span>
                                                      </div>
                                                      {l.titlePinyin && (
                                                        <p className="text-[#9aa6ff] font-inter text-xs truncate">
                                                          {l.titlePinyin}
                                                        </p>
                                                      )}
                                                      {l.titleTranslation && (
                                                        <p className="text-[#a6a6a6] font-inter text-xs truncate">
                                                          {l.titleTranslation}
                                                        </p>
                                                      )}
                                                      <p className="text-[#a6a6a6] font-inter text-xs mt-1">
                                                        {new Date(
                                                          l.createdAt
                                                        ).toLocaleString()}
                                                      </p>
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
                    <h4 className="text-white font-inter font-medium">
                      My Dialogues
                    </h4>
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
                                                  <div className="flex items-start gap-3">
                                                    <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                                                      <MessageSquare className="w-5 h-5 text-purple-500" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <div className="flex items-center justify-between gap-2">
                                                        <p className="text-white font-inter font-semibold truncate">
                                                          {l.title ||
                                                            `Dialogue #${l.id}`}
                                                        </p>
                                                        <span
                                                          className={`ml-2 px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                                        >
                                                          HSK {l.level}
                                                        </span>
                                                      </div>
                                                      {l.titlePinyin && (
                                                        <p className="text-[#9aa6ff] font-inter text-xs truncate">
                                                          {l.titlePinyin}
                                                        </p>
                                                      )}
                                                      {l.titleTranslation && (
                                                        <p className="text-[#a6a6a6] font-inter text-xs truncate">
                                                          {l.titleTranslation}
                                                        </p>
                                                      )}
                                                      <p className="text-[#a6a6a6] font-inter text-xs mt-1">
                                                        {new Date(
                                                          l.createdAt
                                                        ).toLocaleString()}
                                                      </p>
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
              <div className="flex gap-2 flex-col md:flex-row md:items-center justify-between">
                <h3 className="text-white font-inter font-semibold">Stories</h3>
                <div className="flex items-center gap-1 sm:gap-2">
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
                      className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4"
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
                                            <div className="flex items-start gap-3">
                                              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                                                <BookOpen className="w-5 h-5 text-orange-400" />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                  <p className="text-white font-inter font-semibold truncate">
                                                    {l.title ||
                                                      `Lesson #${l.id}`}
                                                  </p>
                                                  <span
                                                    className={`ml-2 px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                                  >
                                                    HSK {l.level}
                                                  </span>
                                                </div>
                                                {l.titlePinyin && (
                                                  <p className="text-[#9aa6ff] font-inter text-xs truncate">
                                                    {l.titlePinyin}
                                                  </p>
                                                )}
                                                {l.titleTranslation && (
                                                  <p className="text-[#a6a6a6] font-inter text-xs truncate">
                                                    {l.titleTranslation}
                                                  </p>
                                                )}
                                                <p className="text-[#a6a6a6] font-inter text-xs mt-1">
                                                  {new Date(
                                                    l.createdAt
                                                  ).toLocaleString()}
                                                </p>
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
              <div className="flex gap-2 flex-col md:flex-row md:items-center justify-between">
                <h3 className="text-white font-inter font-semibold">
                  Dialogues
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
                    className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4"
                  >
                    <AnimatePresence mode="popLayout">
                      {allDialogues
                        .filter(
                          (i) => !new Set(myItems.map((m) => m.id)).has(i.id)
                        )
                        .filter((i) =>
                          dialogueLevels.length > 0
                            ? dialogueLevels.includes(i.level)
                            : true
                        )
                        .reduce(
                          (
                            pages: LessonListItem[][],
                            item: LessonListItem,
                            idx: number
                          ) => {
                            const pageIdx = Math.floor(idx / 9);
                            if (!pages[pageIdx]) pages[pageIdx] = [];
                            pages[pageIdx].push(item);
                            return pages;
                          },
                          []
                        )
                        .map((page, i) => {
                          const padCount = Math.max(0, 9 - page.length);
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
                                          <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                                              <MessageSquare className="w-5 h-5 text-purple-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center justify-between gap-2">
                                                <p className="text-white font-inter font-semibold truncate">
                                                  {l.title ||
                                                    `Dialogue #${l.id}`}
                                                </p>
                                                <span
                                                  className={`ml-2 px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                                                >
                                                  HSK {l.level}
                                                </span>
                                              </div>
                                              {l.titlePinyin && (
                                                <p className="text-[#9aa6ff] font-inter text-xs truncate">
                                                  {l.titlePinyin}
                                                </p>
                                              )}
                                              {l.titleTranslation && (
                                                <p className="text-[#a6a6a6] font-inter text-xs truncate">
                                                  {l.titleTranslation}
                                                </p>
                                              )}
                                              <p className="text-[#a6a6a6] font-inter text-xs mt-1">
                                                {new Date(
                                                  l.createdAt
                                                ).toLocaleString()}
                                              </p>
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
                {allDialogues
                  .filter((i) => !new Set(myItems.map((m) => m.id)).has(i.id))
                  .filter((i) =>
                    dialogueLevels.length > 0
                      ? dialogueLevels.includes(i.level)
                      : true
                  ).length > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {(() => {
                      const totalLen = allDialogues
                        .filter(
                          (i) => !new Set(myItems.map((m) => m.id)).has(i.id)
                        )
                        .filter((i) =>
                          dialogueLevels.length > 0
                            ? dialogueLevels.includes(i.level)
                            : true
                        ).length;
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
