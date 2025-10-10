"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getLesson,
  generateLesson,
  submitAttempt,
  type CurriculumLesson,
} from "@/lib/api/curriculum";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { Loader2, Plus } from "lucide-react";
import { useRef } from "react";
import * as React from "react";
import { toast } from "sonner";
import { getHSKPillClasses } from "@/lib/constants/hsk";

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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getLesson(unitId, lessonId);
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
          <h1 className="text-2xl font-inter font-semibold text-white">
            {lessonData?.title || "Lesson"}
          </h1>
          {lessonData?.description && (
            <p className="text-white/60 font-inter">{lessonData.description}</p>
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
              <section className="rounded-xl p-5">
                <h2 className="text-xl font-semibold mb-2">Explanation</h2>
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
              <section className="rounded-xl p-5">
                <h2 className="text-xl font-semibold mb-2">Micro passage</h2>
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
              <section className="rounded-xl  p-5">
                <h2 className="text-xl font-semibold mb-2">Quiz</h2>
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
      </div>
    </DashboardLayout>
  );
}

function ExplainView({ content }: { content: ExplainContent }) {
  return (
    <div className="space-y-6">
      {content?.overview && <p className="text-white/80">{content.overview}</p>}
      {Array.isArray(content?.sections) &&
        content.sections.map((s: ExplainSection, idx: number) => (
          <article key={idx} className="rounded-xl border border-white/10 bg-[#2e323a] p-4">
            <h3 className="font-medium text-white">{s.title}</h3>
            {s.concept && <p className="text-white/80 mt-1">{s.concept}</p>}
            {Array.isArray(s.examples) && s.examples.length > 0 && (
              <div className="mt-2 space-y-1">
                {s.examples.map(
                  (
                    ex: { zh: string; pinyin?: string; en?: string },
                    i: number
                  ) => (
                    <div key={i} className="text-sm">
                      <div className="text-white">{ex.zh}</div>
                      {ex.pinyin && (
                        <div className="text-white/70">{ex.pinyin}</div>
                      )}
                      {ex.en && <div className="text-white/70">{ex.en}</div>}
                    </div>
                  )
                )}
              </div>
            )}
            {Array.isArray(s.pitfalls) && s.pitfalls.length > 0 && (
              <div className="mt-3">
                <div className="text-white/80 text-sm font-medium">
                  Pitfalls
                </div>
                <ul className="mt-1 space-y-1 text-sm">
                  {s.pitfalls.map(
                    (
                      p: { bad: string; good: string; note?: string },
                      i: number
                    ) => (
                      <li
                        key={i}
                        className="rounded-lg bg-black/30 border border-white/10 p-2"
                      >
                        <div className="text-red-300">✕ {p.bad}</div>
                        <div className="text-green-300">✓ {p.good}</div>
                        {p.note && (
                          <div className="text-white/70">{p.note}</div>
                        )}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
            {Array.isArray(s.checks) && s.checks.length > 0 && (
              <div className="mt-3">
                <div className="text-white/80 text-sm font-medium">
                  Quick checks
                </div>
                <ul className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {s.checks.map(
                    (
                      c: {
                        type: "tf" | "fill";
                        prompt: string;
                        answer?: string;
                      },
                      i: number
                    ) => (
                      <li
                        key={i}
                        className="rounded-lg bg-black/30 border border-white/10 p-2"
                      >
                        <div className="text-white/90">{c.prompt}</div>
                        {typeof c.answer === "string" && (
                          <div className="text-white/60 mt-1">
                            Answer: {c.answer}
                          </div>
                        )}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </article>
        ))}
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
    <div className="mt-6" ref={contentRef}>
      <h3 className="text-base font-semibold text-white mb-2">Micro passage</h3>
      <div className="rounded-xl border border-[#404040] bg-[#2e323a] p-4 relative">
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
        <p className="text-white text-lg leading-8" aria-label="Micro passage">
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
                    <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                      {t.pinyin}
                    </span>
                  ) : (
                    <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                      •
                    </span>
                  )
                ) : null}
                <span
                  className={`px-[1px] rounded ${t.isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
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
          <div className="text-white/70 mt-2">
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
    <div className="space-y-3" ref={contentRef}>
      <div className="rounded-xl border border-[#404040] bg-[#2e323a] p-4 relative">
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
        <p className="text-white text-lg leading-8" aria-label="Micro passage">
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
                    <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                      {t.pinyin}
                    </span>
                  ) : (
                    <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                      •
                    </span>
                  )
                ) : null}
                <span
                  className={`px-[1px] rounded ${t.isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
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
          <div className="text-white/70 mt-2">
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
        <div className="rounded-xl border border-white/10 p-4">
          <div className="text-white/80 text-sm font-medium mb-2">
            Comprehension
          </div>
          <ul className="space-y-2 text-sm">
            {content.questions.map(
              (q: { type: "tf" | "short"; prompt: string }, i: number) => (
                <li
                  key={i}
                  className="rounded-lg bg-black/30 border border-white/10 p-2"
                >
                  <div className="text-white/90">{q.prompt}</div>
                </li>
              )
            )}
          </ul>
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

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <>
          <ol className="space-y-3 list-decimal list-inside">
            {items.map((it: QuizItem, i: number) => {
              const choice = selected[i] ?? null;
              const showRationale =
                submitted && typeof it.rationale === "string";
              // correctness indicated via button states; avoid unused var
              return (
                <li
                  key={i}
                  className="rounded-xl border border-white/10 bg-[#2e323a] p-4"
                >
                  <div className="text-white/90 mb-2">{it.question}</div>
                  {Array.isArray(it.options) && (
                    <ul
                      role="listbox"
                      aria-label={`Choices for question ${i + 1}`}
                      className="space-y-1 text-sm"
                    >
                      {it.options.map((opt: string, j: number) => {
                        const selectedNow = choice === j;
                        const showState =
                          submitted && typeof it.answerIndex === "number";
                        const correctChoice = showState && it.answerIndex === j;
                        const incorrectChosen =
                          showState && selectedNow && !correctChoice;
                        return (
                          <li key={j}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedNow}
                              onClick={() => toggle(i, j)}
                              className={
                                "w-full text-left rounded border px-3 py-2 transition-colors cursor-pointer" +
                                (selectedNow
                                  ? " border-white/40 bg-white/10 "
                                  : " border-white/10 bg-black/30 hover:bg-white/10 ") +
                                (correctChoice
                                  ? " border-green-500/50 bg-green-500/10 "
                                  : "") +
                                (incorrectChosen
                                  ? " border-red-500/50 bg-red-500/10 "
                                  : "")
                              }
                            >
                              {opt}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {showRationale && (
                    <div className="text-white/60 mt-2 text-sm">
                      Rationale: {it.rationale}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitted}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 font-inter text-white transition-colors duration-200 hover:bg-white/15 disabled:opacity-50 cursor-pointer"
            >
              {submitted ? "Submitted" : "Submit"}
            </button>
            {submitted && result && (
              <div className="text-white/80 text-sm">
                You answered {result.correct.filter(Boolean).length} /{" "}
                {items.length} correctly ({result.score}%).
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-white/70">No quiz items.</div>
      )}
    </div>
  );
}
