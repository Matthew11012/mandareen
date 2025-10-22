"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { flashcardsApi, type DueFlashcardItem } from "@/lib/api/flashcards";
import { toast } from "sonner";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/hooks/use-reduced-motion-safe";

export default function FlashcardsPage() {
  const [cards, setCards] = useState<DueFlashcardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealPinyin, setRevealPinyin] = useState<Record<number, boolean>>({});
  const [revealTrans, setRevealTrans] = useState<Record<number, boolean>>({});
  const [showAllSentences, setShowAllSentences] = useState<
    Record<number, boolean>
  >({});
  const prefersReducedMotion = useReducedMotionSafe();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const due = await flashcardsApi.due();
      setCards(due);
    } catch {
      setError("Failed to load due flashcards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grade = async (id: number, quality: number) => {
    try {
      await flashcardsApi.review(id, quality);
      setCards((prev) => prev.slice(1));
      setRevealPinyin((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
      setRevealTrans((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
      setShowAllSentences((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
      toast.success("Review submitted");
    } catch {
      toast.error("Failed to submit review");
    }
  };

  const current = useMemo(() => cards[0], [cards]);
  // Session-scoped totals for stable progress denominator
  const [sessionTotal, setSessionTotal] = useState<number>(0);
  useEffect(() => {
    if (cards.length > 0 && sessionTotal === 0) {
      setSessionTotal(cards.length);
    }
    if (cards.length === 0 && sessionTotal !== 0) {
      // Reset between batches
      setSessionTotal(0);
    }
  }, [cards.length, sessionTotal]);
  // Progress index within this session (1-based). If no cards, 0.
  const progressIndex = useMemo(() => {
    if (sessionTotal === 0 || cards.length === 0) return 0;
    const completed = sessionTotal - cards.length; // how many already reviewed
    return Math.min(sessionTotal, completed + 1);
  }, [sessionTotal, cards.length]);
  const remainingExcludingCurrent = useMemo(
    () => Math.max(cards.length - 1, 0),
    [cards.length]
  );

  // Popup replicated from lessons viewer for consistent UX
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
  const popupDesktopRef = useRef<HTMLDivElement | null>(null);
  const popupMobileRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dialogInitialFocusRef = useRef<HTMLButtonElement | null>(null);
  const popupTriggerRef = useRef<HTMLElement | null>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const desktopEl = popupDesktopRef.current;
      const mobileEl = popupMobileRef.current;
      const target = e.target as Node;
      const clickedInsideDesktop = desktopEl && desktopEl.contains(target);
      const clickedInsideMobile = mobileEl && mobileEl.contains(target);
      if (!clickedInsideDesktop && !clickedInsideMobile) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
      dialogInitialFocusRef.current?.focus();
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [popup.open]);
  useEffect(() => {
    if (!popup.open) {
      setPopupPos(null);
      return;
    }
    // Only position for desktop popup; mobile sheet is fixed at top
    const isDesktop =
      typeof window !== "undefined" ? window.innerWidth >= 640 : true;
    if (!isDesktop) {
      setPopupPos(null);
      return;
    }

    // Use a timeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const modal = popupDesktopRef.current;
      const container = contentRef.current;
      if (!modal || !container) return;

      const modalRect = modal.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();

      const margin = 8;
      const contW = contRect.width;

      // Use the stored popup coordinates directly
      let left = popup.x;
      let top = popup.y + (popup.anchorH || 0) + margin;

      // Account for the transform: translate(-50%, 0) which centers the popup
      // The popup.x is already the center of the word, so we use it directly

      // Ensure popup stays within card bounds horizontally
      // Since popup is centered on 'left', we need to check if half-width fits
      const halfWidth = modalRect.width / 2;
      left = Math.max(
        halfWidth + margin,
        Math.min(left, contW - halfWidth - margin)
      );

      // Ensure popup stays within card bounds vertically
      const maxTop = contRect.height - modalRect.height - margin;
      top = Math.min(top, maxTop);

      setPopupPos({ left, top });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [popup.open, popup.x, popup.y, popup.anchorH]);

  const addWordToFlashcards = async (
    hanzi: string,
    ctx?: { hanzi?: string; pinyin?: string; translation?: string },
    vocab?: { pinyin?: string; definition?: string; hskLevel?: number }
  ) => {
    try {
      const { post } = await import("@/lib/http/http");
      await post("flashcards", {
        hanzi,
        sentenceHanzi: ctx?.hanzi,
        sentencePinyin: ctx?.pinyin,
        sentenceTranslation: ctx?.translation,
        vocabPinyin: vocab?.pinyin,
        vocabDefinition: vocab?.definition,
        vocabHskLevel: vocab?.hskLevel,
      });
      toast.success("Added to flashcards");
    } catch {
      toast.error("Failed to add to flashcards");
    }
  };

  // Build per-character pinyin from provided segments (preferred),
  // falling back to the space-delimited pinyin string.
  const computePerCharPinyin = (
    hanzi: string,
    opts?: {
      pinyin?: string;
      segments?: Array<{
        text: string;
        isWord: boolean;
        pinyin?: string;
      }>;
    }
  ): string[] => {
    const chars = Array.from(hanzi || "");
    const perChar: string[] = new Array(chars.length).fill("");
    const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);

    // Prefer segments if available to correctly distribute combined pinyins
    if (opts?.segments && opts.segments.length > 0) {
      let ci = 0;
      const advanceToNextChinese = () => {
        while (ci < chars.length && !isCJK(chars[ci])) ci++;
      };
      advanceToNextChinese();
      for (const seg of opts.segments) {
        const chineseLen = Array.from(seg.text).filter((c) => isCJK(c)).length;
        if (!seg.isWord || !seg.pinyin) {
          for (let k = 0; k < chineseLen; k++) {
            if (ci >= chars.length) break;
            advanceToNextChinese();
            ci++;
          }
          continue;
        }
        const syllables = seg.pinyin.trim().split(/\s+/).filter(Boolean);
        for (let k = 0; k < chineseLen; k++) {
          advanceToNextChinese();
          if (ci >= chars.length) break;
          perChar[ci] = syllables[k] || syllables[0] || "";
          ci++;
        }
      }
      return perChar;
    }

    const tokens = (opts?.pinyin || "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    let pi = 0;
    for (let i = 0; i < chars.length; i++) {
      if (isCJK(chars[i])) perChar[i] = tokens[pi++] || "";
    }
    return perChar;
  };

  // Sentence renderer: pinyin above hanzi per character
  const renderSentenceWithPinyin = (
    hanzi: string,
    pinyin?: string,
    segments?: Array<{
      text: string;
      isWord: boolean;
      pinyin?: string;
      definition?: string;
      definitions?: string[];
      hskLevel?: number;
    }>
  ) => {
    if (!current) return null;
    if (Array.isArray(segments) && segments.length > 0) {
      return (
        <div className="leading-8 text-white font-inter sm:text-[18px] text-[16px]">
          {segments.map((seg, idx) => {
            const isWord = Boolean(seg.isWord);
            return (
              <span
                key={idx}
                className="inline-flex flex-col items-center align-top mr-[2px]"
              >
                {revealPinyin[current.id] ? (
                  isWord && seg.pinyin ? (
                    <motion.span
                      initial={
                        prefersReducedMotion ? false : { opacity: 0, y: -4 }
                      }
                      animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className="text-xs text-[#c6ceff] leading-none mb-[2px]"
                    >
                      {seg.pinyin}
                    </motion.span>
                  ) : (
                    <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                      •
                    </span>
                  )
                ) : null}
                <button
                  type="button"
                  className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b6bff] cursor-pointer" : ""}`}
                  title={seg.definition || ""}
                  onClick={(e) => {
                    if (!isWord) return;
                    const anchor = (
                      e.currentTarget as HTMLButtonElement
                    ).getBoundingClientRect();
                    const container =
                      contentRef.current?.getBoundingClientRect();

                    // If contentRef is null, try to find the card container
                    if (!container) {
                      const cardElement = e.currentTarget.closest(
                        '[class*="bg-[#2e323a]"]'
                      );
                      const cardRect = cardElement?.getBoundingClientRect();
                      if (cardRect) {
                        const px =
                          anchor.left - cardRect.left + anchor.width / 2;
                        const py =
                          anchor.top - cardRect.top + anchor.height + 8; // Add 8px spacing below word

                        popupTriggerRef.current =
                          e.currentTarget as HTMLElement;
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
                        return;
                      }
                    }

                    // Calculate position relative to the card container
                    const px = container
                      ? anchor.left - container.left + anchor.width / 2
                      : anchor.left;
                    const py = container
                      ? anchor.top - container.top + anchor.height + 8 // Add 8px spacing below word
                      : anchor.top;

                    popupTriggerRef.current = e.currentTarget as HTMLElement;
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
                  aria-label={isWord ? `Details for ${seg.text}` : undefined}
                >
                  {seg.text}
                </button>
              </span>
            );
          })}
        </div>
      );
    }

    const tokens = computePerCharPinyin(hanzi, { pinyin });
    const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
    const chars = Array.from(hanzi || "");
    return (
      <div className="leading-8 text-white font-inter sm:text-[18px] text-[16px]  ">
        {chars.map((ch, idx) => {
          const showTop = !!revealPinyin[current.id];
          const top = showTop && isCJK(ch) ? tokens[idx] || "" : "";
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {showTop ? (
                top ? (
                  <span className="text-xs text-[#c6ceff] leading-none mb-[2px]">
                    {top}
                  </span>
                ) : (
                  <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                    •
                  </span>
                )
              ) : null}
              <span className="px-[1px] rounded">{ch}</span>
            </span>
          );
        })}
      </div>
    );
  };

  const gradeHelp: Record<number, string> = {
    0: "Complete blackout",
    1: "Incorrect; remembered after seeing answer",
    2: "Incorrect; remembered with significant hint",
    3: "Correct with difficulty",
    4: "Correct; hesitated",
    5: "Perfect recall",
  };

  // Keyboard shortcuts 0–5 for grading (disabled when dialog open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current || popup.open) return;
      if (e.key >= "0" && e.key <= "5") {
        const q = Number(e.key);
        e.preventDefault();
        void grade(current.id, q);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [current, popup.open]);

  return (
    <DashboardLayout title="Flashcards" subtitle="Review due items">
      <div className="p-6 space-y-6">
        {cards.length > 0 && (
          <div className="text-[#a6a6a6] text-sm">{cards.length} due</div>
        )}
        {loading ? (
          <div className="flex justify-center">
            <div className="w-full max-w-xl bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-[#3a3e46] rounded w-1/3" />
                <div className="h-4 bg-[#3a3e46] rounded w-1/2" />
                <div className="h-20 bg-[#2a2e35] rounded" />
                <div className="h-10 bg-[#2a2e35] rounded" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="flex justify-center">
            <div className="w-full max-w-xl bg-[#2e323a] rounded-xl p-6 border border-[#404040] text-red-300">
              <div className="mb-3">{error}</div>
              <button
                onClick={() => load()}
                className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        ) : cards.length === 0 ? (
          <div className="flex justify-center">
            <div className="w-full max-w-xl bg-[#2e323a] rounded-xl p-6 border border-[#404040] text-[#a6a6a6]">
              <div className="text-white text-lg mb-2">All caught up!</div>
              <div>No cards due. Great job!</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={current?.id}
                ref={contentRef}
                className="w-full max-w-xl bg-[#2e323a] rounded-xl p-6 border border-[#404040] relative"
                initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }}
                animate={prefersReducedMotion ? {} : { opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? {} : { opacity: 0, x: -24 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  mass: 0.6,
                }}
              >
                {sessionTotal > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-[#a6a6a6]">
                      <span>
                        Card {progressIndex} of {sessionTotal}
                      </span>
                      <span className="text-[#7a7a7a]">
                        {remainingExcludingCurrent} remaining today
                      </span>
                    </div>
                    <div className="h-1 mt-1 rounded bg-[#1f2329]">
                      <div
                        className="h-1 rounded bg-[#4040f2]"
                        style={{
                          width: `${(progressIndex / sessionTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-white text-2xl font-inter">
                      {current.hanzi}
                    </div>
                    {revealPinyin[current.id] && (
                      <motion.div
                        initial={
                          prefersReducedMotion ? false : { opacity: 0, y: -4 }
                        }
                        animate={
                          prefersReducedMotion ? {} : { opacity: 1, y: 0 }
                        }
                        className="text-[#c6ceff] mt-2"
                      >
                        {current.pinyin || "(no pinyin)"}
                      </motion.div>
                    )}
                    {revealTrans[current.id] && (
                      <motion.div
                        initial={
                          prefersReducedMotion ? false : { opacity: 0, y: -4 }
                        }
                        animate={
                          prefersReducedMotion ? {} : { opacity: 1, y: 0 }
                        }
                        className="text-[#a6a6a6] text-sm mt-2"
                      >
                        {current.definition || "(no definition)"}
                      </motion.div>
                    )}
                    {typeof current.hskLevel === "number" && (
                      <div
                        className={`mt-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs ${getHSKPillClasses(current.hskLevel)}`}
                      >
                        HSK {current.hskLevel}
                      </div>
                    )}
                    {Array.isArray(
                      (
                        current as unknown as {
                          sentences?: {
                            hanzi: string;
                            pinyin?: string;
                            translation?: string;
                          }[];
                        }
                      ).sentences
                    ) &&
                      (
                        current as unknown as {
                          sentences?: {
                            hanzi: string;
                            pinyin?: string;
                            translation?: string;
                          }[];
                        }
                      ).sentences!.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {(
                            current as unknown as {
                              sentences: {
                                hanzi: string;
                                pinyin?: string;
                                translation?: string;
                              }[];
                            }
                          ).sentences
                            .slice(
                              0,
                              showAllSentences[current.id] ? undefined : 1
                            )
                            .map(
                              (
                                s: {
                                  hanzi: string;
                                  pinyin?: string;
                                  translation?: string;
                                  segments?: Array<{
                                    text: string;
                                    isWord: boolean;
                                    pinyin?: string;
                                    definition?: string;
                                    definitions?: string[];
                                    hskLevel?: number;
                                  }>;
                                },
                                idx: number
                              ) => (
                                <div
                                  key={idx}
                                  className="bg-[#262a31] rounded p-3 border border-[#3a3a3a]"
                                >
                                  {renderSentenceWithPinyin(
                                    s.hanzi,
                                    s.pinyin,
                                    s.segments
                                  )}
                                  {revealTrans[current.id] && s.translation && (
                                    <div className="text-[#a6a6a6] text-sm mt-1">
                                      {s.translation}
                                    </div>
                                  )}
                                </div>
                              )
                            )}
                          {!showAllSentences[current.id] &&
                            (
                              current as unknown as {
                                sentences: Array<{
                                  hanzi: string;
                                  pinyin?: string;
                                  translation?: string;
                                }>;
                              }
                            ).sentences.length > 1 && (
                              <button
                                onClick={() =>
                                  setShowAllSentences((r) => ({
                                    ...r,
                                    [current.id]: true,
                                  }))
                                }
                                className="w-full px-3 py-2 bg-[#262a31] border border-[#3a3a3a] rounded hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                              >
                                More examples (
                                {(
                                  current as unknown as {
                                    sentences: Array<{
                                      hanzi: string;
                                      pinyin?: string;
                                      translation?: string;
                                    }>;
                                  }
                                ).sentences.length - 1}
                                )
                              </button>
                            )}
                        </div>
                      )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <button
                      onClick={() =>
                        setRevealPinyin((r) => ({
                          ...r,
                          [current.id]: !r[current.id],
                        }))
                      }
                      className="px-3 py-1.5 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] hover:bg-[#3a3e46] text-[#c6c6c6] cursor-pointer text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b6bff] transition-colors"
                      aria-pressed={!!revealPinyin[current.id]}
                      aria-label={
                        revealPinyin[current.id]
                          ? "Hide pinyin"
                          : "Reveal pinyin"
                      }
                    >
                      {revealPinyin[current.id]
                        ? "Hide Pinyin"
                        : "Reveal Pinyin"}
                    </button>
                    <button
                      onClick={() =>
                        setRevealTrans((r) => ({
                          ...r,
                          [current.id]: !r[current.id],
                        }))
                      }
                      className="px-3 py-1.5 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] hover:bg-[#3a3e46] text-[#c6c6c6] cursor-pointer text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b6bff] transition-colors"
                      aria-pressed={!!revealTrans[current.id]}
                      aria-label={
                        revealTrans[current.id]
                          ? "Hide meaning"
                          : "Reveal meaning"
                      }
                    >
                      {revealTrans[current.id]
                        ? "Hide Meaning"
                        : "Reveal Meaning"}
                    </button>
                  </div>
                </div>
                <div className="mt-6 pb-20 sm:pb-6">
                  <div className="text-[#a6a6a6] text-xs mb-2">
                    How well did you remember?
                  </div>
                  <div className="hidden sm:grid grid-cols-6 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((q) => (
                      <motion.button
                        key={q}
                        onClick={() => grade(current.id, q)}
                        whileTap={
                          prefersReducedMotion ? undefined : { scale: 0.98 }
                        }
                        className="px-3 py-3 min-h-[44px] bg-[#2e323a] border border-[#404040] rounded hover:border-[#4040f2] text-[#a6a6a6] text-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b6bff]"
                        title={gradeHelp[q]}
                        aria-label={`Grade ${q}: ${gradeHelp[q]}`}
                      >
                        <div className="font-medium">{q}</div>
                        <div className="sr-only">{gradeHelp[q]}</div>
                      </motion.button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((q) => (
                      <div key={q} className="text-[11px] text-[#7a7a7a]">
                        <span className="text-[#a6a6a6] mr-1">{q}:</span>
                        {gradeHelp[q]}
                      </div>
                    ))}
                  </div>
                </div>
                {popup.open && (
                  <div
                    ref={popupDesktopRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label={popup.word}
                    style={{
                      position: "absolute",
                      left: popupPos ? popupPos.left : popup.x,
                      top: popupPos ? popupPos.top : popup.y,
                      zIndex: 50,
                      visibility: "visible",
                      transform: "translate(-50%, 0)",
                    }}
                    className="hidden sm:block bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-bold text-white text-lg truncate">
                        {popup.word}
                      </div>
                      {typeof popup.hskLevel === "number" && (
                        <span
                          className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(popup.hskLevel)}`}
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
                    <div className="mt-3 pt-3 border-t border-[#404040] flex gap-2">
                      <button
                        ref={dialogInitialFocusRef}
                        onClick={() => {
                          setPopup((p) => ({ ...p, open: false }));
                          popupTriggerRef.current?.focus();
                        }}
                        className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => {
                          void addWordToFlashcards(popup.word, undefined, {
                            pinyin: popup.pinyin,
                            definition:
                              popup.definition || popup.definitions?.[0],
                            hskLevel: popup.hskLevel,
                          });
                          setPopup((p) => ({ ...p, open: false }));
                          popupTriggerRef.current?.focus();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
                      >
                        <span className="text-sm font-inter">
                          Add to Flashcards
                        </span>
                      </button>
                    </div>
                  </div>
                )}
                {/* Mobile upper sheet popup */}
                {popup.open && (
                  <div
                    ref={popupMobileRef}
                    className="sm:hidden fixed inset-x-0 top-0 z-40 bg-[#1a1d23]/95 backdrop-blur border-b border-[#2e323a] p-4"
                  >
                    <div className="max-w-sm mx-auto">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="font-bold text-white text-lg truncate">
                          {popup.word}
                        </div>
                        {typeof popup.hskLevel === "number" && (
                          <span
                            className={`text-[10px] leading-none px-2 py-[2px] rounded-full ${getHSKPillClasses(popup.hskLevel)}`}
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
                          ref={dialogInitialFocusRef}
                          onClick={() => {
                            setPopup((p) => ({ ...p, open: false }));
                            popupTriggerRef.current?.focus();
                          }}
                          className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => {
                            void addWordToFlashcards(popup.word, undefined, {
                              pinyin: popup.pinyin,
                              definition:
                                popup.definition || popup.definitions?.[0],
                              hskLevel: popup.hskLevel,
                            });
                            setPopup((p) => ({ ...p, open: false }));
                            popupTriggerRef.current?.focus();
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
                        >
                          <span className="text-sm font-inter">
                            Add to Flashcards
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Sticky mobile grade bar */}
                {current && (
                  <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 bg-[#1a1d23]/95 backdrop-blur border-t border-[#2e323a] p-3">
                    <div className="grid grid-cols-6 gap-2">
                      {[0, 1, 2, 3, 4, 5].map((q) => (
                        <motion.button
                          key={q}
                          onClick={() => grade(current.id, q)}
                          whileTap={
                            prefersReducedMotion ? undefined : { scale: 0.98 }
                          }
                          className="py-2 min-h-[44px] rounded bg-[#2e323a] border border-[#404040] text-[#a6a6a6] text-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b6bff]"
                          aria-label={`Grade ${q}: ${gradeHelp[q]}`}
                          title={gradeHelp[q]}
                        >
                          {q}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
