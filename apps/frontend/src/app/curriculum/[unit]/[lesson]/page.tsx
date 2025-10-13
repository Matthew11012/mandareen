"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getLesson,
  generateLesson,
  submitAttempt,
  getLessonNavigation,
  type CurriculumLesson,
} from "@/lib/api/curriculum";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import {
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Check,
  XCircle,
  Trophy,
  Target,
} from "lucide-react";
import { useRef } from "react";
import * as React from "react";
import { toast } from "sonner";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type TokenLike = {
  text?: string;
  zh?: string;
  pinyin?: string;
  en?: string;
  definition?: string;
  definitions?: string[];
  hskLevel?: number;
  isWord?: boolean;
  startIndex?: number;
  endIndex?: number;
};

type ReadContent = {
  title?: string;
  type?: "READ";
  levelBand?: number;
  passage?: { hanzi?: string; pinyin?: string; translation?: string };
  segments?: TokenLike[];
  questions?: Array<{ type: "tf" | "short"; prompt: string }>;
  citations?: unknown[];
};

type ExplainSection = {
  title: string;
  concept?: string;
  examples?: Array<{ zh: string; pinyin?: string; en?: string }>;
  pitfalls?: Array<{ bad: string; good: string; note?: string }>;
  checks?: Array<{ type: "tf" | "fill"; prompt: string; answer?: string }>;
};

type ExplainContent = {
  title?: string;
  type?: "GRAMMAR";
  overview?: string;
  sections?: ExplainSection[];
  microPassage?: {
    hanzi?: string;
    pinyin?: string;
    translation?: string;
    segments?: TokenLike[];
  } | null;
  citations?: unknown[];
};

type QuizItem = {
  question: string;
  options?: string[];
  answerIndex?: number;
  rationale?: string;
  id?: number;
};

type QuizContent = {
  title?: string;
  type?: "QUIZ";
  items?: QuizItem[];
  passingScore?: number;
  citations?: unknown[];
};

type ActivityUnion =
  | { id: number; type: "READ"; levelBand: number; content: ReadContent }
  | { id: number; type: "GRAMMAR"; levelBand: number; content: ExplainContent }
  | { id: number; type: "QUIZ"; levelBand: number; content: QuizContent };

type LessonView = Omit<CurriculumLesson, "activities"> & {
  activities?: ActivityUnion[];
};

type Params = { unit: string; lesson: string };

export default function LessonRunnerPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { unit, lesson } = React.use(params);
  const unitId = Number(unit);
  const lessonId = Number(lesson);
  const { isLoading: authLoading } = useRequireAuth();
  const [lessonData, setLessonData] = useState<LessonView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<boolean>(false);
  const [navigation, setNavigation] = useState<{
    previous: {
      unitId: number;
      unitTitle: string;
      lessonId: number;
      lessonTitle: string;
      lessonOrder: number;
    } | null;
    next: {
      unitId: number;
      unitTitle: string;
      lessonId: number;
      lessonTitle: string;
      lessonOrder: number;
    } | null;
  } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [data, navData] = await Promise.all([
        getLesson(unitId, lessonId),
        getLessonNavigation(unitId, lessonId),
      ]);

      // Type guard to narrow raw API activities without using any
      const isActivityLike = (
        x: unknown
      ): x is {
        id: number;
        type: string;
        levelBand: number;
        content: unknown;
      } => {
        if (typeof x !== "object" || x === null) return false;
        return "id" in x && "type" in x && "levelBand" in x && "content" in x;
      };

      const typed: LessonView = {
        id: data.id,
        title: data.title,
        description: data.description,
        order: data.order,
        completed: data.completed,
        activities: Array.isArray(data.activities)
          ? (data.activities.filter(isActivityLike).map((a) => ({
              id: a.id,
              type: a.type as ActivityUnion["type"],
              levelBand: a.levelBand,
              content: a.content as ReadContent | ExplainContent | QuizContent,
            })) as ActivityUnion[])
          : undefined,
      };
      setLessonData(typed);
      setNavigation(navData);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load lesson";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, lessonId]);

  const activities = useMemo<ActivityUnion[]>(
    () =>
      Array.isArray(lessonData?.activities)
        ? (lessonData!.activities as ActivityUnion[])
        : [],
    [lessonData]
  );
  const hasExplain = activities.some((a) => a.type === "GRAMMAR");
  const hasRead = activities.some((a) => a.type === "READ");
  const hasQuiz = activities.some((a) => a.type === "QUIZ");

  async function onGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateLesson(unitId, lessonId, { levelBand: 1, force: false });
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  if (authLoading) {
    return (
      <DashboardLayout title="Curriculum" subtitle="Loading lesson…">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/70" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={lessonData?.title ?? "Lesson"}
      subtitle="Deep dive into the explain-first lesson, micro passage, and quiz"
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
            <li>
              <Link href={`/curriculum/${unitId}`} className="hover:text-white">
                Unit
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li className="text-white/80">{lessonData?.title ?? "Lesson"}</li>
          </ol>
        </nav>

        <header className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-inter font-semibold text-white">
            {lessonData?.title || "Lesson"}
          </h1>
          {lessonData?.description && (
            <p className="text-sm sm:text-base text-white/60 font-inter">
              {lessonData.description}
            </p>
          )}
          <hr />
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-inter text-red-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-xl border border-white/10 bg-[#16181d] animate-pulse"
              />
            ))}
          </div>
        )}

        {!loading && lesson && activities.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#16181d] p-6">
            <p className="text-white/80 font-inter">
              No content yet. Generate the lesson activities.
            </p>
            <button
              onClick={onGenerate}
              disabled={generating}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 font-inter text-white transition-colors duration-200 hover:bg-white/15 disabled:opacity-50 cursor-pointer"
            >
              {generating ? "Generating…" : "Generate lesson"}
            </button>
          </div>
        )}

        {activities.length > 0 && (
          <div className="space-y-8">
            {/* Explain-first (GRAMMAR) */}
            {hasExplain && (
              <section className="rounded-xl p-4 sm:p-5">
                <h2 className="text-lg sm:text-xl font-semibold mb-2">
                  Explanation
                </h2>
                {activities
                  .filter(
                    (a): a is Extract<ActivityUnion, { type: "GRAMMAR" }> =>
                      a.type === "GRAMMAR"
                  )
                  .map((a) => (
                    <ExplainView key={a.id} content={a.content} />
                  ))}
                {activities
                  .filter(
                    (a): a is Extract<ActivityUnion, { type: "GRAMMAR" }> =>
                      a.type === "GRAMMAR"
                  )
                  .map((a) => (
                    <ExplainMicroPassage
                      key={`micro-${a.id}`}
                      content={a.content}
                    />
                  ))}
              </section>
            )}

            {/* Micro Passage (READ) */}
            {hasRead && (
              <section className="rounded-xl p-4 sm:p-5">
                <h2 className="text-lg sm:text-xl font-semibold mb-2">
                  Micro passage
                </h2>
                {activities
                  .filter(
                    (a): a is Extract<ActivityUnion, { type: "READ" }> =>
                      a.type === "READ"
                  )
                  .map((a) => (
                    <ReadView key={a.id} content={a.content} />
                  ))}
              </section>
            )}

            {/* Quiz */}
            {hasQuiz && (
              <section className="rounded-xl p-4 sm:p-5">
                <h2 className="text-lg sm:text-xl font-semibold mb-2">Quiz</h2>
                {activities
                  .filter(
                    (a): a is Extract<ActivityUnion, { type: "QUIZ" }> =>
                      a.type === "QUIZ"
                  )
                  .map((a) => (
                    <QuizView
                      key={a.id}
                      content={a.content}
                      activityId={a.id}
                    />
                  ))}
              </section>
            )}
          </div>
        )}

        {/* Navigation */}
        {navigation && (navigation.previous || navigation.next) && (
          <div className="flex items-center justify-between pt-8 border-t border-white/10">
            {navigation.previous ? (
              <Link
                href={`/curriculum/${navigation.previous.unitId}/${navigation.previous.lessonId}`}
                className="inline-flex items-center gap-2 px-4 py-2 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
                <div className="text-left">
                  <div className="text-xs text-white/60">Previous</div>
                  <div className="text-sm font-medium truncate max-w-[200px]">
                    {navigation.previous.lessonTitle}
                  </div>
                  {navigation.previous.unitTitle !== lessonData?.title && (
                    <div className="text-xs text-white/50 truncate max-w-[200px]">
                      {navigation.previous.unitTitle}
                    </div>
                  )}
                </div>
              </Link>
            ) : (
              <div></div>
            )}

            {navigation.next ? (
              <Link
                href={`/curriculum/${navigation.next.unitId}/${navigation.next.lessonId}`}
                className="inline-flex items-center gap-2 px-4 py-2 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors duration-200"
              >
                <div className="text-right">
                  <div className="text-xs text-white/60">Next</div>
                  <div className="text-sm font-medium truncate max-w-[200px]">
                    {navigation.next.lessonTitle}
                  </div>
                  {navigation.next.unitTitle !== lessonData?.title && (
                    <div className="text-xs text-white/50 truncate max-w-[200px]">
                      {navigation.next.unitTitle}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <div></div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ExplainView({ content }: { content: ExplainContent }) {
  return (
    <div className="space-y-8">
      {content?.overview && (
        <div className="relative">
          <div className="absolute left-0 top-0 w-1 h-full bg-blue-500/40 rounded-full"></div>
          <div className="pl-6">
            <h3 className="text-white font-semibold text-base sm:text-lg mb-3">
              Overview
            </h3>
            <p className="text-white/80 leading-relaxed text-sm sm:text-base">
              {content.overview}
            </p>
          </div>
        </div>
      )}

      {Array.isArray(content?.sections) && content.sections.length > 0 && (
        <Accordion
          type="multiple"
          className="w-full space-y-2"
          defaultValue={content.sections.map((_, idx) => `section-${idx}`)}
        >
          {content.sections.map((s: ExplainSection, idx: number) => (
            <AccordionItem
              key={idx}
              value={`section-${idx}`}
              className="border border-white/10 rounded-lg overflow-hidden hover:border-white/20 transition-all duration-200"
            >
              <AccordionTrigger className="px-4 sm:px-6 py-3 sm:py-4 text-white hover:no-underline hover:bg-white/5 transition-all duration-200 cursor-pointer">
                <h3 className="font-semibold text-base sm:text-lg text-left">
                  {s.title}
                </h3>
              </AccordionTrigger>
              <AccordionContent className="pt-2 px-4 sm:px-6 pb-4 sm:pb-6 text-white/80">
                <div className="space-y-4 sm:space-y-6">
                  {s.concept && (
                    <div className="relative">
                      <div className="absolute left-0 top-0 w-1 h-full bg-blue-500/30 rounded-full"></div>
                      <div className="pl-4 sm:pl-6">
                        <h4 className="text-white font-medium text-sm sm:text-base mb-2 sm:mb-3 ">
                          Key Concept
                        </h4>
                        <p className="text-white/80 leading-relaxed text-sm sm:text-base">
                          {s.concept}
                        </p>
                      </div>
                    </div>
                  )}

                  {Array.isArray(s.examples) && s.examples.length > 0 && (
                    <div className="space-y-3 sm:space-y-4">
                      <h4 className="text-white font-medium text-sm sm:text-base">
                        Examples
                      </h4>
                      <div className="space-y-2 sm:space-y-3">
                        {s.examples.map(
                          (
                            ex: { zh: string; pinyin?: string; en?: string },
                            i: number
                          ) => (
                            <div
                              key={i}
                              className="p-3 sm:p-4 border border-white/10 rounded-lg transition-all duration-200"
                            >
                              <div className="space-y-1 sm:space-y-2">
                                <div className="text-white font-semibold text-base sm:text-lg">
                                  {ex.zh}
                                </div>
                                {ex.pinyin && (
                                  <div className="flex items-center gap-2">
                                    <div className="text-blue-400 text-xs sm:text-sm font-mono font-medium">
                                      {ex.pinyin}
                                    </div>
                                  </div>
                                )}
                                {ex.en && (
                                  <div className="text-white/70 text-xs sm:text-sm italic">
                                    {ex.en}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {Array.isArray(s.pitfalls) && s.pitfalls.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-white font-medium text-base">
                        Common Pitfalls
                      </h4>
                      <div className="space-y-3">
                        {s.pitfalls.map(
                          (
                            p: { bad: string; good: string; note?: string },
                            i: number
                          ) => (
                            <div key={i} className="space-y-2">
                              <div className="flex items-start gap-3 p-3 border border-red-500/20 rounded-lg bg-red-500/5">
                                <span className="text-red-400 font-bold text-lg leading-none mt-0.5">
                                  ✕
                                </span>
                                <div className="text-red-300 text-sm flex-1">
                                  {p.bad}
                                </div>
                              </div>
                              <div className="flex items-start gap-3 p-3 border border-green-500/20 rounded-lg bg-green-500/5">
                                <span className="text-green-400 font-bold text-lg leading-none mt-0.5">
                                  ✓
                                </span>
                                <div className="text-green-300 text-sm flex-1">
                                  {p.good}
                                </div>
                              </div>
                              {p.note && (
                                <div className="text-white/60 text-sm italic ml-6 p-2 bg-white/5 rounded border-l-2 border-white/20">
                                  {p.note}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {Array.isArray(s.checks) && s.checks.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-white font-medium text-base">
                        Quick Checks
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {s.checks.map(
                          (
                            c: {
                              type: "tf" | "fill";
                              prompt: string;
                              answer?: string;
                            },
                            i: number
                          ) => (
                            <div
                              key={i}
                              className="p-4 border border-white/10 rounded-lg hover:border-white/20 hover:bg-white/5 transition-all duration-200"
                            >
                              <div className="text-white/90 text-sm mb-2">
                                {c.prompt}
                              </div>
                              {typeof c.answer === "string" && (
                                <div className="text-blue-400 text-xs font-mono bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                                  Answer: {c.answer}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function ExplainMicroPassage({ content }: { content: ExplainContent }) {
  const [showPinyin, setShowPinyin] = useState<boolean>(false);
  // Rich popup like lessons viewer + add-to-flashcards
  const [popup, setPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    anchorH?: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
    tokenIndex?: number;
  }>({ open: false, x: 0, y: 0, word: "" });
  const popupRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [popup.open]);
  useEffect(() => {
    if (!popup.open) {
      setPopupPos(null);
      return;
    }
    const modal = popupRef.current;
    const container = contentRef.current;
    if (!modal || !container) return;
    const modalRect = modal.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const margin = 8;
    const contW = contRect.width;
    const contH = contRect.height;
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Lesson controls"]'
    ) as HTMLElement | null;
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarBottom = toolbarRect ? toolbarRect.bottom : 0;
    const visibleTopInContainer = Math.max(0, toolbarBottom - contRect.top);
    const visibleBottomInContainer = Math.min(
      contH,
      Math.max(0, window.innerHeight - contRect.top)
    );
    let left = popup.x - modalRect.width / 2;
    left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));
    const anchorH = popup.anchorH || 0;
    const availableAbove = popup.y - visibleTopInContainer - margin;
    const availableBelow =
      visibleBottomInContainer - (popup.y + anchorH) - margin;
    let top: number;
    if (modalRect.height <= availableAbove || availableBelow < 0) {
      top = Math.max(
        visibleTopInContainer + margin,
        popup.y - modalRect.height - margin
      );
    } else if (modalRect.height <= availableBelow || availableAbove < 0) {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        popup.y + anchorH + margin
      );
    } else {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        Math.max(visibleTopInContainer + margin, popup.y + anchorH + margin)
      );
    }
    setPopupPos({ left, top });
  }, [popup.open, popup.x, popup.y, popup.anchorH]);

  const tokens = Array.isArray(content?.microPassage?.segments)
    ? content!.microPassage!.segments!
    : [];
  if (!content?.microPassage?.hanzi) return null;
  return (
    <div className="mt-4 sm:mt-6" ref={contentRef}>
      <h3 className="text-sm sm:text-base font-semibold text-white mb-2">
        Micro passage
      </h3>
      <div className="rounded-xl border border-[#404040] bg-[#2e323a] p-3 sm:p-4 relative">
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={() => setShowPinyin((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${
              showPinyin
                ? "border-[#4040f2] text-[#9aa6ff]"
                : "border-[#404040] text-[#a6a6a6]"
            } cursor-pointer`}
            type="button"
            aria-pressed={showPinyin}
            aria-label={showPinyin ? "Hide pinyin" : "Show pinyin"}
          >
            Pinyin {showPinyin ? "On" : "Off"}
          </button>
        </div>
        <p
          className="text-white text-base sm:text-lg leading-7 sm:leading-8"
          aria-label="Micro passage"
        >
          {tokens.length > 0 ? (
            tokens.map((t, i) => (
              <span
                key={i}
                role="button"
                tabIndex={0}
                data-token-id={i}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    (e.currentTarget as HTMLSpanElement).click();
                  if (e.key === "Escape")
                    setPopup((p) => ({ ...p, open: false }));
                }}
                onClick={(e) => {
                  const anchor = (
                    e.currentTarget as HTMLSpanElement
                  ).getBoundingClientRect();
                  const container = contentRef.current?.getBoundingClientRect();
                  const px = container
                    ? anchor.left - container.left + anchor.width / 2
                    : e.clientX;
                  const py = container ? anchor.top - container.top : e.clientY;
                  setPopup({
                    open: true,
                    x: px,
                    y: py,
                    anchorH: anchor.height,
                    word: (t.text ?? t.zh ?? "").toString(),
                    pinyin: t.pinyin,
                    definition: t.definition ?? t.en,
                    definitions: t.definitions,
                    hskLevel: t.hskLevel,
                    tokenIndex: i,
                  });
                }}
                className={`inline-flex flex-col items-center align-top mr-[2px]`}
              >
                {showPinyin ? (
                  t.isWord && t.pinyin ? (
                    <span className="text-[10px] sm:text-xs text-[#9aa6ff] leading-none mb-[1px] sm:mb-[2px]">
                      {t.pinyin}
                    </span>
                  ) : (
                    <span className="text-[10px] sm:text-xs opacity-0 leading-none mb-[1px] sm:mb-[2px] select-none">
                      •
                    </span>
                  )
                ) : null}
                <span
                  className={`px-[1px] rounded text-sm sm:text-lg ${t.isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                >
                  {t.text ?? t.zh ?? ""}
                </span>
              </span>
            ))
          ) : (
            <span>{content.microPassage.hanzi}</span>
          )}
        </p>
        {content.microPassage.translation && (
          <div className="text-white/70 mt-2 text-sm sm:text-base">
            {content.microPassage.translation}
          </div>
        )}
        {popup.open && (
          <div
            ref={popupRef}
            style={{
              position: "absolute",
              left: popupPos ? popupPos.left : popup.x,
              top: popupPos ? popupPos.top : popup.y,
              zIndex: 10,
              visibility: popupPos ? "visible" : "hidden",
              transform: popupPos
                ? "none"
                : "translate(-50%, calc(-100% - 8px))",
            }}
            className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-white text-lg truncate">
                {popup.word}
              </div>
              {typeof popup.hskLevel === "number" && (
                <span
                  className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                    popup.hskLevel
                  )}`}
                  aria-label={`HSK level ${popup.hskLevel}`}
                >
                  HSK {popup.hskLevel}
                </span>
              )}
            </div>
            {popup.pinyin && (
              <div className="text-[#c6ceff] text-sm font-medium truncate">
                {popup.pinyin}
              </div>
            )}
            {Array.isArray(popup.definitions) &&
            popup.definitions.length > 0 ? (
              <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
                {popup.definitions.map((d, i) => (
                  <div key={i}>• {d}</div>
                ))}
              </div>
            ) : popup.definition ? (
              <div className="text-xs text-[#a6a6a6] mt-2">
                {popup.definition}
              </div>
            ) : null}
            <div className="mt-3 pt-3 border-t border-[#404040]">
              <button
                onClick={async () => {
                  try {
                    const ctx = {
                      hanzi: popup.word,
                      pinyin: popup.pinyin,
                      translation:
                        popup.definition ||
                        (Array.isArray(popup.definitions) &&
                        popup.definitions.length > 0
                          ? popup.definitions[0]
                          : undefined),
                    };
                    await fetch(
                      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/flashcards`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${
                            typeof window !== "undefined"
                              ? localStorage.getItem("auth-token")
                              : ""
                          }`,
                        },
                        body: JSON.stringify({
                          hanzi: popup.word,
                          sentenceHanzi: ctx.hanzi,
                          sentencePinyin: ctx.pinyin,
                          sentenceTranslation: ctx.translation,
                          vocabPinyin: popup.pinyin,
                          vocabDefinition:
                            Array.isArray(popup.definitions) &&
                            popup.definitions.length > 0
                              ? popup.definitions[0]
                              : popup.definition,
                          vocabHskLevel: popup.hskLevel,
                        }),
                      }
                    );
                    toast.success("Added to flashcards");
                  } catch {
                    toast.error("Failed to add to flashcards");
                  } finally {
                    setPopup((p) => ({ ...p, open: false }));
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-inter">Add to Flashcards</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadView({ content }: { content: ReadContent }) {
  // Popup replicated from lessons viewer for consistent UX
  const [showPinyin, setShowPinyin] = useState<boolean>(false);
  const [popup, setPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    anchorH?: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
  }>({ open: false, x: 0, y: 0, word: "" });
  const popupRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [popup.open]);

  useEffect(() => {
    if (!popup.open) {
      setPopupPos(null);
      return;
    }
    const modal = popupRef.current;
    const container = contentRef.current;
    if (!modal || !container) return;
    const modalRect = modal.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const margin = 8;
    const contW = contRect.width;
    const contH = contRect.height;
    // Visible region inside container
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Lesson controls"]'
    ) as HTMLElement | null;
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarBottom = toolbarRect ? toolbarRect.bottom : 0;
    const visibleTopInContainer = Math.max(0, toolbarBottom - contRect.top);
    const visibleBottomInContainer = Math.min(
      contH,
      Math.max(0, window.innerHeight - contRect.top)
    );
    // Horizontal center, clamp
    let left = popup.x - modalRect.width / 2;
    left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));
    // Vertical above/below
    const anchorH = popup.anchorH || 0;
    const availableAbove = popup.y - visibleTopInContainer - margin;
    const availableBelow =
      visibleBottomInContainer - (popup.y + anchorH) - margin;
    let top: number;
    if (modalRect.height <= availableAbove || availableBelow < 0) {
      top = Math.max(
        visibleTopInContainer + margin,
        popup.y - modalRect.height - margin
      );
    } else if (modalRect.height <= availableBelow || availableAbove < 0) {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        popup.y + anchorH + margin
      );
    } else {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        Math.max(visibleTopInContainer + margin, popup.y + anchorH + margin)
      );
    }
    setPopupPos({ left, top });
  }, [popup.open, popup.x, popup.y, popup.anchorH]);

  const tokens = Array.isArray(content?.segments) ? content.segments : [];
  return (
    <div className="space-y-2 sm:space-y-3" ref={contentRef}>
      <div className="rounded-xl border border-[#404040] bg-[#2e323a] p-3 sm:p-4 relative">
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={() => setShowPinyin((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${
              showPinyin
                ? "border-[#4040f2] text-[#9aa6ff]"
                : "border-[#404040] text-[#a6a6a6]"
            } cursor-pointer`}
            type="button"
            aria-pressed={showPinyin}
            aria-label={showPinyin ? "Hide pinyin" : "Show pinyin"}
          >
            Pinyin {showPinyin ? "On" : "Off"}
          </button>
        </div>
        <p
          className="text-white text-base sm:text-lg leading-7 sm:leading-8"
          aria-label="Micro passage"
        >
          {tokens.length > 0 ? (
            tokens.map((t, i) => (
              <span
                key={i}
                role="button"
                tabIndex={0}
                data-token-id={i}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    (e.currentTarget as HTMLSpanElement).click();
                  if (e.key === "Escape")
                    setPopup((p) => ({ ...p, open: false }));
                }}
                onClick={(e) => {
                  const anchor = (
                    e.currentTarget as HTMLSpanElement
                  ).getBoundingClientRect();
                  const container = contentRef.current?.getBoundingClientRect();
                  const px = container
                    ? anchor.left - container.left + anchor.width / 2
                    : e.clientX;
                  const py = container ? anchor.top - container.top : e.clientY;
                  setPopup({
                    open: true,
                    x: px,
                    y: py,
                    anchorH: anchor.height,
                    word: (t.text ?? t.zh ?? "").toString(),
                    pinyin: t.pinyin,
                    definition: t.definition ?? t.en,
                    definitions: t.definitions,
                    hskLevel: t.hskLevel,
                  });
                }}
                className={`inline-flex flex-col items-center align-top mr-[2px]`}
              >
                {showPinyin ? (
                  t.isWord && t.pinyin ? (
                    <span className="text-[10px] sm:text-xs text-[#9aa6ff] leading-none mb-[1px] sm:mb-[2px]">
                      {t.pinyin}
                    </span>
                  ) : (
                    <span className="text-[10px] sm:text-xs opacity-0 leading-none mb-[1px] sm:mb-[2px] select-none">
                      •
                    </span>
                  )
                ) : null}
                <span
                  className={`px-[1px] rounded text-sm sm:text-lg ${t.isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                >
                  {t.text ?? t.zh ?? ""}
                </span>
              </span>
            ))
          ) : (
            <span>{content?.passage?.hanzi}</span>
          )}
        </p>
        {content?.passage?.translation && (
          <div className="text-white/70 mt-2 text-sm sm:text-base">
            {content.passage.translation}
          </div>
        )}
        {popup.open && (
          <div
            ref={popupRef}
            style={{
              position: "absolute",
              left: popupPos ? popupPos.left : popup.x,
              top: popupPos ? popupPos.top : popup.y,
              zIndex: 10,
              visibility: popupPos ? "visible" : "hidden",
              transform: popupPos
                ? "none"
                : "translate(-50%, calc(-100% - 8px))",
            }}
            className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-white text-lg truncate">
                {popup.word}
              </div>
              {typeof popup.hskLevel === "number" && (
                <span
                  className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                    popup.hskLevel
                  )}`}
                  aria-label={`HSK level ${popup.hskLevel}`}
                >
                  HSK {popup.hskLevel}
                </span>
              )}
            </div>
            {popup.pinyin && (
              <div className="text-[#c6ceff] text-sm font-medium truncate">
                {popup.pinyin}
              </div>
            )}
            {Array.isArray(popup.definitions) &&
            popup.definitions.length > 0 ? (
              <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
                {popup.definitions.map((d, i) => (
                  <div key={i}>• {d}</div>
                ))}
              </div>
            ) : popup.definition ? (
              <div className="text-xs text-[#a6a6a6] mt-2">
                {popup.definition}
              </div>
            ) : null}
            <div className="mt-3 pt-3 border-t border-[#404040]">
              <button
                onClick={async () => {
                  try {
                    const ctx = {
                      hanzi: popup.word,
                      pinyin: popup.pinyin,
                      translation:
                        popup.definition ||
                        (Array.isArray(popup.definitions) &&
                        popup.definitions.length > 0
                          ? popup.definitions[0]
                          : undefined),
                    };
                    await fetch(
                      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/flashcards`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${
                            typeof window !== "undefined"
                              ? localStorage.getItem("auth-token")
                              : ""
                          }`,
                        },
                        body: JSON.stringify({
                          hanzi: popup.word,
                          sentenceHanzi: ctx.hanzi,
                          sentencePinyin: ctx.pinyin,
                          sentenceTranslation: ctx.translation,
                          vocabPinyin: popup.pinyin,
                          vocabDefinition:
                            Array.isArray(popup.definitions) &&
                            popup.definitions.length > 0
                              ? popup.definitions[0]
                              : popup.definition,
                          vocabHskLevel: popup.hskLevel,
                        }),
                      }
                    );
                    toast.success("Added to flashcards");
                  } catch {
                    toast.error("Failed to add to flashcards");
                  } finally {
                    setPopup((p) => ({ ...p, open: false }));
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-inter">Add to Flashcards</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {Array.isArray(content?.questions) && content.questions.length > 0 && (
        <ComprehensionView questions={content.questions} />
      )}
    </div>
  );
}

function ComprehensionView({
  questions,
}: {
  questions: Array<{
    type: "tf" | "short";
    prompt: string;
    translation?: string;
    answer?: boolean;
    explanation?: string;
    segments?: Array<{
      text: string;
      pinyin?: string;
      definition?: string;
      definitions?: string[];
      hskLevel?: number;
      isWord: boolean;
    }>;
  }>;
}) {
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, boolean | null>
  >({});
  const [showAnswers, setShowAnswers] = useState(false);

  const handleAnswerSelect = (questionIndex: number, answer: boolean) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  };

  const handleSubmit = () => {
    setShowAnswers(true);
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <div className="rounded-xl border border-white/10 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-white/80 text-xs sm:text-sm font-medium">
          Comprehension Check
        </div>
        {!showAnswers && (
          <div className="text-white/60 text-xs">
            {answeredCount} / {questions.length} answered
          </div>
        )}
      </div>

      <div className="space-y-3">
        {questions.map((question, i) => {
          const selectedAnswer = selectedAnswers[i];
          const showResult =
            showAnswers && typeof question.answer === "boolean";
          const isCorrect = showResult && selectedAnswer === question.answer;
          const isIncorrect =
            showResult &&
            selectedAnswer !== null &&
            selectedAnswer !== question.answer;

          return (
            <div
              key={i}
              className={`rounded-lg border p-3 sm:p-4 transition-all duration-200 ${
                showResult
                  ? isCorrect
                    ? "border-green-500/30 bg-green-500/5"
                    : isIncorrect
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-white/10 bg-black/30"
                  : "border-white/10 bg-black/30"
              }`}
            >
              {/* Question Text */}
              <div className="mb-3">
                <QuestionText
                  text={question.prompt}
                  segments={question.segments}
                />
                {question.translation && (
                  <div className="text-white/60 text-xs sm:text-sm mt-1 italic">
                    {question.translation}
                  </div>
                )}
              </div>

              {/* Answer Options */}
              {question.type === "tf" && (
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={() => handleAnswerSelect(i, true)}
                    disabled={showAnswers}
                    className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                      selectedAnswer === true
                        ? showResult
                          ? isCorrect
                            ? "border-green-500 bg-green-500/20 text-green-200"
                            : "border-red-500 bg-red-500/20 text-red-200"
                          : "border-blue-500 bg-blue-500/20 text-blue-200"
                        : showResult && question.answer === true
                          ? "border-green-500/30 bg-green-500/10 text-green-300"
                          : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                    } ${showAnswers ? "cursor-default" : "cursor-pointer"}`}
                  >
                    True
                  </button>
                  <button
                    onClick={() => handleAnswerSelect(i, false)}
                    disabled={showAnswers}
                    className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                      selectedAnswer === false
                        ? showResult
                          ? isCorrect
                            ? "border-green-500 bg-green-500/20 text-green-200"
                            : "border-red-500 bg-red-500/20 text-red-200"
                          : "border-blue-500 bg-blue-500/20 text-blue-200"
                        : showResult && question.answer === false
                          ? "border-green-500/30 bg-green-500/10 text-green-300"
                          : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                    } ${showAnswers ? "cursor-default" : "cursor-pointer"}`}
                  >
                    False
                  </button>
                </div>
              )}

              {/* Explanation */}
              {showResult && question.explanation && (
                <div className="text-xs sm:text-sm text-white/70 bg-white/5 p-2 rounded border-l-2 border-blue-500/30">
                  <strong>Explanation:</strong> {question.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit Button */}
      {!showAnswers && (
        <div className="flex justify-end pt-3">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
          >
            Check Answers
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionText({
  text,
  segments,
}: {
  text: string;
  segments?: Array<{
    text: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
    isWord: boolean;
  }>;
}) {
  const [popup, setPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    anchorH?: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
  }>({ open: false, x: 0, y: 0, word: "" });
  const popupRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [popup.open]);

  useEffect(() => {
    if (!popup.open) {
      setPopupPos(null);
      return;
    }
    const modal = popupRef.current;
    const container = contentRef.current;
    if (!modal || !container) return;
    const modalRect = modal.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const margin = 8;
    const contW = contRect.width;
    const contH = contRect.height;
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Lesson controls"]'
    ) as HTMLElement | null;
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarBottom = toolbarRect ? toolbarRect.bottom : 0;
    const visibleTopInContainer = Math.max(0, toolbarBottom - contRect.top);
    const visibleBottomInContainer = Math.min(
      contH,
      Math.max(0, window.innerHeight - contRect.top)
    );
    let left = popup.x - modalRect.width / 2;
    left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));
    const anchorH = popup.anchorH || 0;
    const availableAbove = popup.y - visibleTopInContainer - margin;
    const availableBelow =
      visibleBottomInContainer - (popup.y + anchorH) - margin;
    let top: number;
    if (modalRect.height <= availableAbove || availableBelow < 0) {
      top = Math.max(
        visibleTopInContainer + margin,
        popup.y - modalRect.height - margin
      );
    } else if (modalRect.height <= availableBelow || availableAbove < 0) {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        popup.y + anchorH + margin
      );
    } else {
      top = Math.min(
        visibleBottomInContainer - modalRect.height - margin,
        Math.max(visibleTopInContainer + margin, popup.y + anchorH + margin)
      );
    }
    setPopupPos({ left, top });
  }, [popup.open, popup.x, popup.y, popup.anchorH]);

  if (!segments || segments.length === 0) {
    return <div className="text-white/90 text-sm sm:text-base">{text}</div>;
  }

  return (
    <div className="relative" ref={contentRef}>
      <div className="text-white/90 text-sm sm:text-base leading-relaxed">
        {segments.map((segment, i) => (
          <span
            key={i}
            className={`cursor-pointer hover:bg-white/10 rounded px-1 transition-colors duration-200 ${
              segment.isWord ? "hover:text-white" : ""
            }`}
            onClick={(e) => {
              if (!segment.isWord) return;
              const anchor = (
                e.currentTarget as HTMLSpanElement
              ).getBoundingClientRect();
              const container = contentRef.current?.getBoundingClientRect();
              const px = container
                ? anchor.left - container.left + anchor.width / 2
                : e.clientX;
              const py = container ? anchor.top - container.top : e.clientY;
              setPopup({
                open: true,
                x: px,
                y: py,
                anchorH: anchor.height,
                word: segment.text,
                pinyin: segment.pinyin,
                definition: segment.definition,
                definitions: segment.definitions,
                hskLevel: segment.hskLevel,
              });
            }}
          >
            {segment.text}
          </span>
        ))}
      </div>

      {/* Popup */}
      {popup.open && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            left: popupPos ? popupPos.left : popup.x,
            top: popupPos ? popupPos.top : popup.y,
            zIndex: 10,
            visibility: popupPos ? "visible" : "hidden",
            transform: popupPos ? "none" : "translate(-50%, calc(-100% - 8px))",
          }}
          className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold text-white text-lg truncate">
              {popup.word}
            </div>
            {typeof popup.hskLevel === "number" && (
              <span
                className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(
                  popup.hskLevel
                )}`}
                aria-label={`HSK level ${popup.hskLevel}`}
              >
                HSK {popup.hskLevel}
              </span>
            )}
          </div>
          {popup.pinyin && (
            <div className="text-[#c6ceff] text-sm font-medium truncate">
              {popup.pinyin}
            </div>
          )}
          {Array.isArray(popup.definitions) && popup.definitions.length > 0 ? (
            <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
              {popup.definitions.map((d, i) => (
                <div key={i}>• {d}</div>
              ))}
            </div>
          ) : popup.definition ? (
            <div className="text-xs text-[#a6a6a6] mt-2">
              {popup.definition}
            </div>
          ) : null}
          <div className="mt-3 pt-3 border-t border-[#404040]">
            <button
              onClick={async () => {
                try {
                  const ctx = {
                    hanzi: popup.word,
                    pinyin: popup.pinyin,
                    translation:
                      popup.definition ||
                      (Array.isArray(popup.definitions) &&
                      popup.definitions.length > 0
                        ? popup.definitions[0]
                        : undefined),
                  };
                  await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/flashcards`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${
                          typeof window !== "undefined"
                            ? localStorage.getItem("auth-token")
                            : ""
                        }`,
                      },
                      body: JSON.stringify({
                        hanzi: popup.word,
                        sentenceHanzi: ctx.hanzi,
                        sentencePinyin: ctx.pinyin,
                        sentenceTranslation: ctx.translation,
                        vocabPinyin: popup.pinyin,
                        vocabDefinition:
                          Array.isArray(popup.definitions) &&
                          popup.definitions.length > 0
                            ? popup.definitions[0]
                            : popup.definition,
                        vocabHskLevel: popup.hskLevel,
                      }),
                    }
                  );
                  toast.success("Added to flashcards");
                } catch {
                  toast.error("Failed to add to flashcards");
                } finally {
                  setPopup((p) => ({ ...p, open: false }));
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-inter">Add to Flashcards</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuizView({
  content,
  activityId,
}: {
  content: QuizContent;
  activityId: number;
}) {
  const [selected, setSelected] = useState<Record<number, number | null>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [result, setResult] = useState<{
    correct: boolean[];
    score: number;
  } | null>(null);

  const items = Array.isArray(content?.items) ? content.items : [];
  const answeredCount = Object.keys(selected).length;
  const progressPercentage =
    items.length > 0 ? (answeredCount / items.length) * 100 : 0;

  const toggle = (qi: number, oi: number) => {
    if (submitted) return;
    setSelected((prev) => ({ ...prev, [qi]: oi }));
  };

  const onSubmit = async () => {
    const answers = items.map((_, i) => selected[i] ?? null);
    // Compute local correctness
    const correct = items.map((it, i) =>
      typeof it.answerIndex === "number" ? answers[i] === it.answerIndex : false
    );
    const score = Math.round(
      (correct.filter(Boolean).length / Math.max(1, items.length)) * 100
    );
    setResult({ correct, score });
    setSubmitted(true);
    try {
      await submitAttempt(activityId, { answers }, score);
    } catch {
      // non-blocking
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreMessage = (score: number) => {
    if (score >= 90) return "Excellent work!";
    if (score >= 80) return "Great job!";
    if (score >= 70) return "Good effort!";
    if (score >= 60) return "Keep practicing!";
    return "Review the material and try again.";
  };

  return (
    <div className="space-y-6">
      {items.length > 0 ? (
        <>
          {/* Quiz Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center gap-2 sm:gap-3">
              <div>
                <h3 className="text-white font-semibold text-base sm:text-lg">
                  Quiz Assessment
                </h3>
                <p className="text-white/70 text-xs sm:text-sm">
                  {items.length} question{items.length !== 1 ? "s" : ""} •
                  Choose the best answer
                </p>
              </div>
            </div>
            {!submitted && (
              <div className="text-right">
                <div className="text-white/70 text-xs sm:text-sm mb-1">
                  Progress
                </div>
                <div className="text-white font-semibold text-sm sm:text-base">
                  {answeredCount} / {items.length}
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {!submitted && (
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-4 sm:space-y-6">
            {items.map((it: QuizItem, i: number) => {
              const choice = selected[i] ?? null;
              const showRationale =
                submitted && typeof it.rationale === "string";
              const showState = submitted && typeof it.answerIndex === "number";
              const isCorrect = showState && choice === it.answerIndex;
              const isIncorrect =
                showState && choice !== null && choice !== it.answerIndex;

              return (
                <div
                  key={i}
                  className="relative p-4 sm:p-6 border border-white/10 rounded-xl bg-white/[0.02] hover:border-white/20 transition-all duration-200"
                >
                  {/* Question Number */}
                  <div className="flex items-start gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div
                      className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold ${
                        showState
                          ? isCorrect
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : isIncorrect
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-white/10 text-white/80 border border-white/20"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-medium text-base sm:text-lg mb-3 sm:mb-4 leading-relaxed">
                        {it.question}
                      </h4>
                    </div>
                  </div>

                  {/* Answer Options */}
                  {Array.isArray(it.options) && (
                    <div className="space-y-2 sm:space-y-3 ml-8 sm:ml-12">
                      {it.options.map((opt: string, j: number) => {
                        const selectedNow = choice === j;
                        const correctChoice = showState && it.answerIndex === j;
                        const incorrectChosen =
                          showState && selectedNow && !correctChoice;

                        return (
                          <button
                            key={j}
                            type="button"
                            onClick={() => toggle(i, j)}
                            disabled={submitted}
                            className={`w-full text-left p-3 sm:p-4 rounded-lg border transition-all duration-200 ${
                              submitted
                                ? "cursor-default"
                                : "cursor-pointer hover:border-white/30 hover:bg-white/5"
                            } ${
                              selectedNow
                                ? showState
                                  ? correctChoice
                                    ? "border-green-500/50 bg-green-500/10 text-green-100"
                                    : incorrectChosen
                                      ? "border-red-500/50 bg-red-500/10 text-red-100"
                                      : "border-blue-500/50 bg-blue-500/10 text-blue-100"
                                  : "border-blue-500/50 bg-blue-500/10 text-white"
                                : showState && correctChoice
                                  ? "border-green-500/30 bg-green-500/5 text-green-200"
                                  : "border-white/10 bg-white/5 text-white/90"
                            }`}
                          >
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div
                                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center ${
                                  selectedNow
                                    ? showState
                                      ? correctChoice
                                        ? "border-green-400 bg-green-500"
                                        : incorrectChosen
                                          ? "border-red-400 bg-red-500"
                                          : "border-blue-400 bg-blue-500"
                                      : "border-blue-400 bg-blue-500"
                                    : showState && correctChoice
                                      ? "border-green-400 bg-green-500/20"
                                      : "border-white/30"
                                }`}
                              >
                                {selectedNow && (
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                                )}
                                {showState && correctChoice && !selectedNow && (
                                  <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-400" />
                                )}
                              </div>
                              <span className="flex-1 text-sm sm:text-base">
                                {opt}
                              </span>
                              {showState && correctChoice && (
                                <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                              )}
                              {showState && incorrectChosen && (
                                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Rationale */}
                  {showRationale && (
                    <div className="mt-3 sm:mt-4 ml-8 sm:ml-12 p-3 sm:p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex items-start gap-2">
                        <div>
                          <h5 className="text-blue-400 font-medium text-xs sm:text-sm mb-1">
                            Explanation
                          </h5>
                          <p className="text-white/80 text-xs sm:text-sm leading-relaxed">
                            {it.rationale}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Results Summary */}
          {submitted && result && (
            <div className="p-4 sm:p-6 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-2 sm:p-3 bg-blue-500/20 rounded-lg">
                    <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg sm:text-xl">
                      Quiz Complete!
                    </h3>
                    <p className="text-white/70 text-xs sm:text-sm">
                      {getScoreMessage(result.score)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-2xl sm:text-3xl font-bold ${getScoreColor(result.score)}`}
                  >
                    {result.score}%
                  </div>
                  <div className="text-white/70 text-xs sm:text-sm">
                    {result.correct.filter(Boolean).length} / {items.length}{" "}
                    correct
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          {!submitted && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 gap-3 sm:gap-0">
              <div className="text-white/70 text-xs sm:text-sm">
                {answeredCount === items.length
                  ? "Ready to submit!"
                  : `${items.length - answeredCount} question${items.length - answeredCount !== 1 ? "s" : ""} remaining`}
              </div>
              <button
                type="button"
                onClick={onSubmit}
                disabled={answeredCount !== items.length}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl cursor-pointer text-sm sm:text-base"
              >
                Submit Quiz
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <div className="p-4 bg-white/5 rounded-lg inline-block mb-4">
            <Target className="w-8 h-8 text-white/60" />
          </div>
          <p className="text-white/70">No quiz items available.</p>
        </div>
      )}
    </div>
  );
}
