"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { getHSKPillClasses } from "@/lib/constants/hsk";

type Token = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
  hskLevel?: number;
};

type QuizItem = {
  question: {
    zh: string;
    translation?: string;
    segments?: Token[];
  };
  options?: Array<{
    zh: string;
    translation?: string;
    segments?: Token[];
  }>;
  answerIndex?: number;
  rationale?: string;
};

type SelectedWord = {
  text: string;
  pinyin?: string;
  paraIndex?: number;
  tokenIndex?: number;
  contextZh?: string;
  contextEn?: string;
};

type QuizSectionProps = {
  quiz: {
    items?: QuizItem[];
    passingScore?: number;
  };
  disabled?: boolean;
  onAddFlashcard?: (
    hanzi: string,
    context?: { hanzi?: string; pinyin?: string; translation?: string },
    vocab?: { pinyin?: string; definition?: string; hskLevel?: number }
  ) => void;
  onPerfectScore: () => void | Promise<void>;
  multiSelect?: boolean;
  selectedWords?: Record<string, SelectedWord>;
  toggleSelectWord?: (
    key: string,
    text: string,
    pinyin: string | undefined,
    paraIndex: number,
    tokenIndex: number,
    contextZh?: string,
    contextEn?: string
  ) => void;
};

// InlineSegments component for rendering segmented text with word popups
function InlineSegments({
  segments,
  fallbackZh,
  showPinyin,
  hoverClass,
  contextSentenceZh,
  contextSentenceTranslation,
  onAddFlashcard,
  multiSelect,
  selectedWords,
  toggleSelectWord,
  keyPrefix,
}: {
  segments?: Token[];
  fallbackZh?: string;
  showPinyin?: boolean;
  hoverClass?: string;
  contextSentenceZh?: string;
  contextSentenceTranslation?: string;
  onAddFlashcard?: (
    hanzi: string,
    context?: { hanzi?: string; pinyin?: string; translation?: string },
    vocab?: { pinyin?: string; definition?: string; hskLevel?: number }
  ) => void;
  multiSelect?: boolean;
  selectedWords?: Record<string, SelectedWord>;
  toggleSelectWord?: (
    key: string,
    text: string,
    pinyin: string | undefined,
    paraIndex: number,
    tokenIndex: number,
    contextZh?: string,
    contextEn?: string
  ) => void;
  keyPrefix: string;
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

  return (
    <div className="relative" ref={contentRef}>
      <div className="leading-7 text-white font-thin sm:font-normal text-lg">
        {Array.isArray(segments) && segments.length > 0
          ? segments.map((seg, idx) => {
              const isWord = Boolean(seg.isWord);
              return (
                <span
                  key={idx}
                  className="inline-flex flex-col items-center align-top mr-[2px]"
                >
                  {showPinyin ? (
                    isWord && seg.pinyin ? (
                      <span className="text-[10px] text-[#9aa6ff] leading-none mb-[2px]">
                        {seg.pinyin}
                      </span>
                    ) : (
                      <span className="text-[10px] opacity-0 leading-none mb-[2px] select-none">
                        •
                      </span>
                    )
                  ) : null}
                  <span
                    className={`px-[1px] rounded ${isWord ? `${hoverClass || "hover:bg-[#404040]"} cursor-pointer` : ""}`}
                    title={seg.definition || ""}
                    onClick={(e) => {
                      if (!isWord) return;
                      const key = `${keyPrefix}-${idx}-${seg.text}`;
                      if (multiSelect && toggleSelectWord) {
                        toggleSelectWord(
                          key,
                          seg.text,
                          seg.pinyin,
                          -2,
                          idx,
                          contextSentenceZh,
                          contextSentenceTranslation
                        );
                        return;
                      }
                      const anchor = (
                        e.currentTarget as HTMLSpanElement
                      ).getBoundingClientRect();
                      const container =
                        contentRef.current?.getBoundingClientRect();
                      const px = container
                        ? anchor.left - container.left + anchor.width / 2
                        : e.clientX;
                      const py = container
                        ? anchor.top - container.top
                        : e.clientY;
                      setPopup({
                        open: true,
                        x: px,
                        y: py,
                        anchorH: anchor.height,
                        word: seg.text,
                        pinyin: seg.pinyin,
                        definition: seg.definition,
                        definitions: seg.definitions,
                        hskLevel: seg.hskLevel,
                      });
                    }}
                  >
                    <span
                      className={
                        "underline-offset-[3px] " +
                        (multiSelect && selectedWords && selectedWords[`${keyPrefix}-${idx}-${seg.text}`]
                          ? "underline decoration-[#4040f2] decoration-2"
                          : "")
                      }
                    >
                      {seg.text}
                    </span>
                  </span>
                </span>
              );
            })
          : fallbackZh}
      </div>
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
          className="hidden sm:block bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
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
              onClick={() => {
                const ctx = {
                  hanzi: contextSentenceZh || fallbackZh,
                  pinyin: undefined,
                  translation: contextSentenceTranslation,
                };
                const vocabDef = Array.isArray(popup.definitions)
                  ? popup.definitions[0]
                  : popup.definition;
                onAddFlashcard?.(popup.word, ctx, {
                  pinyin: popup.pinyin,
                  definition: vocabDef,
                  hskLevel: popup.hskLevel,
                });
                setPopup((p) => ({ ...p, open: false }));
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]"
              type="button"
              aria-label="Add word to flashcards"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm font-inter">Add to Flashcards</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile top sheet popup for InlineSegments */}
      <AnimatePresence>
        {popup.open && (
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              duration: 0.3,
            }}
            className="sm:hidden fixed inset-x-0 top-0 z-40 bg-[#1a1d23]/95 backdrop-blur border-b border-[#2e323a] p-4"
          >
            <div className="max-w-sm mx-auto">
              <div className="flex items-center justify-between gap-3 mb-3">
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
                <div className="text-[#c6ceff] text-sm font-medium truncate mb-2">
                  {popup.pinyin}
                </div>
              )}
              {Array.isArray(popup.definitions) &&
              popup.definitions.length > 0 ? (
                <div className="text-xs text-[#a6a6a6] mb-3 space-y-1">
                  {popup.definitions.map((d, i) => (
                    <div key={i}>• {d}</div>
                  ))}
                </div>
              ) : popup.definition ? (
                <div className="text-xs text-[#a6a6a6] mb-3">
                  {popup.definition}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPopup((p) => ({ ...p, open: false }));
                  }}
                  className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23]"
                  type="button"
                  aria-label="Close word popup"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    const ctx = {
                      hanzi: contextSentenceZh || fallbackZh,
                      pinyin: undefined,
                      translation: contextSentenceTranslation,
                    };
                    const vocabDef = Array.isArray(popup.definitions)
                      ? popup.definitions[0]
                      : popup.definition;
                    onAddFlashcard?.(popup.word, ctx, {
                      pinyin: popup.pinyin,
                      definition: vocabDef,
                      hskLevel: popup.hskLevel,
                    });
                    setPopup((p) => ({ ...p, open: false }));
                  }}
                  className="px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1a1d23]"
                  type="button"
                  aria-label="Add word to flashcards"
                >
                  <Plus
                    className="w-4 h-4 inline-block mr-1"
                    aria-hidden="true"
                  />
                  Add
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function QuizSection({
  quiz,
  disabled,
  onAddFlashcard,
  onPerfectScore,
  multiSelect,
  selectedWords,
  toggleSelectWord,
}: QuizSectionProps) {
  const items = useMemo(
    () => (Array.isArray(quiz?.items) ? quiz.items : []),
    [quiz?.items]
  );
  const [selected, setSelected] = useState<Record<number, number | null>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [result, setResult] = useState<{
    correct: boolean[];
    score: number;
  } | null>(null);
  const [showPinyin, setShowPinyin] = useState<boolean>(false);
  const [showTranslation, setShowTranslation] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const completed = Boolean(disabled);

  // Memoize score calculation
  const answeredCount = useMemo(() => Object.keys(selected).length, [selected]);

  const toggle = useCallback(
    (qi: number, oi: number) => {
      if (submitted || disabled) return;
      setSelected((prev) => ({ ...prev, [qi]: prev[qi] === oi ? null : oi }));
    },
    [submitted, disabled]
  );

  const onSubmit = useCallback(async () => {
    if (answeredCount !== items.length) return;

    const answers = items.map((_, i) => selected[i] ?? null);
    const correct = items.map((it, i) =>
      typeof it.answerIndex === "number" ? answers[i] === it.answerIndex : false
    );
    const score = Math.round(
      (correct.filter(Boolean).length / Math.max(1, items.length)) * 100
    );
    setResult({ correct, score });
    setSubmitted(true);

    if (score === 100) {
      setIsSubmitting(true);
      try {
        await onPerfectScore();
      } catch (error) {
        console.error("Failed to mark lesson as finished:", error);
        toast.error("Failed to mark lesson as finished");
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [answeredCount, items, selected, onPerfectScore]);

  const onRetry = useCallback(() => {
    setSelected({});
    setSubmitted(false);
    setResult(null);
  }, []);

  // Early return for empty quiz
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* ARIA live region for score announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        aria-label="Quiz score announcements"
      >
        {result
          ? `Quiz score: ${result.score}%. ${
              result.score === 100
                ? "Perfect score! Lesson completed."
                : "You can retry to improve your score."
            }`
          : ""}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="min-w-0">
          <h3 className="text-white font-semibold">Quiz</h3>
          <p className="text-white/70 text-xs">
            {items.length} {items.length === 1 ? "question" : "questions"} •
            Choose the best answer
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {completed && (
            <span className="px-2 py-1 text-xs rounded bg-green-500/15 text-green-300 border border-green-500/30">
              Completed
            </span>
          )}
          <button
            onClick={() => setShowPinyin((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${
              showPinyin
                ? "border-[#4040f2] text-[#9aa6ff]"
                : "border-[#404040] text-[#a6a6a6]"
            } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31] transition-colors duration-200`}
            type="button"
            aria-pressed={showPinyin}
            aria-label={showPinyin ? "Hide pinyin" : "Show pinyin"}
          >
            Pinyin {showPinyin ? "On" : "Off"}
          </button>
          <button
            onClick={() => setShowTranslation((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${
              showTranslation
                ? "border-[#4040f2] text-[#9aa6ff]"
                : "border-[#404040] text-[#a6a6a6]"
            } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31] transition-colors duration-200`}
            type="button"
            aria-pressed={showTranslation}
            aria-label={
              showTranslation ? "Hide translations" : "Show translations"
            }
          >
            <span className="sr-only">Translation</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 26 25"
              fill="none"
              aria-hidden="true"
              className="inline-block align-middle"
            >
              <path
                d="M1 3.46154H9.61539M9.61539 3.46154H15.1539M9.61539 3.46154V1M18.2308 3.46154H15.1539M15.1539 3.46154C14.144 6.82785 12.0292 10.01 9.61539 12.8066M9.61539 12.8066C7.61662 15.1223 5.41282 17.1737 3.46154 18.8462M9.61539 12.8066C8.38462 11.4615 6.41539 8.75385 5.92308 7.76923M9.61539 12.8066L13.3077 16.3846"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15.1538 23.1538L16.5605 19.4615M16.5605 19.4615L20.0769 10.2307L23.5933 19.4615M16.5605 19.4615H23.5933M25 23.1538L23.5933 19.4615"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {items.map((it, i) => {
          const choice = selected[i] ?? null;
          const showState =
            (submitted || completed) && typeof it.answerIndex === "number";
          const isCorrect = showState && choice === it.answerIndex;
          const isIncorrect =
            showState && choice !== null && choice !== it.answerIndex;

          return (
            <div
              key={i}
              className={`relative p-2 sm:border border-white/10 rounded-xl sm:bg-white/[0.02] hover:border-white/20 transition-all duration-200 ${
                isCorrect
                  ? "border-green-500/30 bg-green-500/5"
                  : isIncorrect
                    ? "border-red-500/30 bg-red-500/5"
                    : ""
              }`}
            >
              <div className="mb-3 text-white">
                <div className="text-white/60 text-xs mb-2 font-medium">
                  Question {i + 1}
                </div>
                <InlineSegments
                  segments={it.question?.segments}
                  fallbackZh={it.question?.zh}
                  showPinyin={showPinyin}
                  contextSentenceZh={it.question?.zh}
                  contextSentenceTranslation={it.question?.translation}
                  onAddFlashcard={onAddFlashcard}
                  multiSelect={multiSelect}
                  selectedWords={selectedWords}
                  toggleSelectWord={toggleSelectWord}
                  keyPrefix={`quiz-q${i}`}
                />
                {showTranslation && it.question?.translation ? (
                  <div className="text-white/60 text-xs mt-1 italic">
                    {it.question.translation}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                {(it.options || []).map((opt, j) => {
                  const selectedNow = choice === j;
                  const correctChoice = showState && it.answerIndex === j;
                  const incorrectChosen =
                    showState && selectedNow && !correctChoice;

                  return (
                    <button
                      key={j}
                      onClick={() => toggle(i, j)}
                      disabled={submitted || disabled}
                      aria-disabled={submitted || disabled}
                      aria-pressed={selectedNow}
                      aria-label={`Option ${String.fromCharCode(65 + j)}: ${opt.zh}. ${
                        showState
                          ? correctChoice
                            ? "Correct answer"
                            : incorrectChosen
                              ? "Incorrect answer"
                              : ""
                          : selectedNow
                            ? "Selected"
                            : ""
                      }`}
                      onKeyDown={(e) => {
                        if (submitted || disabled) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(i, j);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                        submitted || disabled
                          ? "cursor-default"
                          : "cursor-pointer"
                      } ${
                        // Force green highlight for correct option when completed
                        completed && correctChoice
                          ? "border-green-500/50 bg-green-500/10 text-green-100"
                          : selectedNow
                            ? showState
                              ? isCorrect
                                ? "border-green-500/50 bg-green-500/10 text-green-100"
                                : incorrectChosen
                                  ? "border-red-500/50 bg-red-500/10 text-red-100"
                                  : "border-blue-500/50 bg-blue-500/10 text-blue-100"
                              : "border-blue-500/50 bg-blue-500/10 text-white"
                            : `border-white/10 bg-white/5 text-white/90${disabled ? "" : " hover:border-white/30 hover:bg-white/5"}`
                      } ${
                        selectedNow && !disabled
                          ? "hover:border-blue-500/50 hover:bg-blue-500/10"
                          : ""
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31]`}
                      type="button"
                    >
                      <div className="text-sm text-white">
                        <InlineSegments
                          segments={opt.segments}
                          fallbackZh={opt.zh}
                          showPinyin={showPinyin}
                          hoverClass="hover:bg-white/15"
                          contextSentenceZh={opt.zh}
                          contextSentenceTranslation={opt.translation}
                          onAddFlashcard={onAddFlashcard}
                          multiSelect={multiSelect}
                          selectedWords={selectedWords}
                          toggleSelectWord={toggleSelectWord}
                          keyPrefix={`quiz-q${i}-opt${j}`}
                        />
                        {showTranslation && opt.translation ? (
                          <div className="text-white/60 text-xs mt-1">
                            {opt.translation}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 px-4">
        {completed ? (
          <div className="w-full">
            <div className="relative overflow-hidden rounded-xl border border-green-500/40 bg-gradient-to-r from-green-600/20 via-green-500/15 to-emerald-500/15 p-4">
              <div
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-green-500/10 blur-2xl"
                aria-hidden="true"
              />
              <div className="flex items-center gap-3 text-green-200">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600/30 border border-green-500/40">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 12l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold tracking-tight text-green-300">
                    Perfect score! Lesson completed
                  </div>
                  <div className="text-sm text-green-200/80">
                    Score: 100% • Great job—quiz is now locked
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : result ? (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${
                result.score === 100
                  ? "bg-green-500/15 text-green-300 border-green-500/40"
                  : "bg-white/5 text-white/80 border-white/20"
              }`}
              aria-label={`Score: ${result.score}%`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M21 10l-6-6M3 10l6-6m6 16l6-6M9 20l-6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-semibold">Score: {result.score}%</span>
            </span>
          </div>
        ) : (
          <div className="text-white/70 text-xs">
            {answeredCount} / {items.length} answered
          </div>
        )}
        {!completed && (
          <div className="flex items-center gap-2">
            {!submitted ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={answeredCount !== items.length || isSubmitting}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31] disabled:hover:bg-blue-500 flex items-center gap-2"
                aria-label={
                  answeredCount !== items.length
                    ? `Please answer all ${items.length} questions before submitting`
                    : "Submit quiz answers"
                }
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Submitting…</span>
                  </>
                ) : (
                  "Submit"
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 border border-white/20 text-white rounded-lg hover:bg-white/5 transition-colors duration-200 cursor-pointer text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31]"
                aria-label="Retry quiz"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
