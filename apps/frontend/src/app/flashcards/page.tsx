"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { flashcardsApi, type DueFlashcardItem } from "@/lib/api/flashcards";
import { toast } from "sonner";
import { getHSKPillClasses } from "@/lib/constants/hsk";

export default function FlashcardsPage() {
  const [cards, setCards] = useState<DueFlashcardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealPinyin, setRevealPinyin] = useState<Record<number, boolean>>({});
  const [revealTrans, setRevealTrans] = useState<Record<number, boolean>>({});

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
      toast.success("Review submitted");
    } catch {
      toast.error("Failed to submit review");
    }
  };

  const current = useMemo(() => cards[0], [cards]);

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
    let left = popup.x - modalRect.width / 2;
    left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));
    const anchorH = popup.anchorH || 0;
    // Always position below the word inside the card
    const top = popup.y + anchorH + margin;
    setPopupPos({ left, top });
  }, [popup.open, popup.x, popup.y, popup.anchorH]);

  const addWordToFlashcards = async (
    hanzi: string,
    ctx?: { hanzi?: string; pinyin?: string; translation?: string },
    vocab?: { pinyin?: string; definition?: string; hskLevel?: number }
  ) => {
    try {
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
            hanzi,
            sentenceHanzi: ctx?.hanzi,
            sentencePinyin: ctx?.pinyin,
            sentenceTranslation: ctx?.translation,
            vocabPinyin: vocab?.pinyin,
            vocabDefinition: vocab?.definition,
            vocabHskLevel: vocab?.hskLevel,
          }),
        }
      );
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
        <div className="leading-8 text-white font-inter text-[18px]">
          {segments.map((seg, idx) => {
            const isWord = Boolean(seg.isWord);
            return (
              <span
                key={idx}
                className="inline-flex flex-col items-center align-top mr-[2px]"
              >
                {revealPinyin[current.id] ? (
                  isWord && seg.pinyin ? (
                    <span className="text-xs text-[#c6ceff] leading-none mb-[2px]">
                      {seg.pinyin}
                    </span>
                  ) : (
                    <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                      •
                    </span>
                  )
                ) : null}
                <span
                  className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                  title={seg.definition || ""}
                  onClick={(e) => {
                    if (!isWord) return;
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
                  {seg.text}
                </span>
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
      <div className="leading-8 text-white font-inter text-[18px]">
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

  return (
    <DashboardLayout title="Flashcards" subtitle="Review due items">
      <div className="p-6 space-y-6">
        {cards.length > 0 && (
          <div className="text-[#a6a6a6] text-sm">{cards.length} due</div>
        )}
        {loading ? (
          <div className="text-[#a6a6a6]">Loading...</div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : cards.length === 0 ? (
          <div className="text-[#a6a6a6]">No cards due. Great job!</div>
        ) : (
          <div className="flex justify-center">
            <div
              ref={contentRef}
              className="w-full max-w-xl bg-[#2e323a] rounded-xl p-6 border border-[#404040] relative"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-white text-2xl font-inter">
                    {current.hanzi}
                  </div>
                  {revealPinyin[current.id] && (
                    <div className="text-[#c6ceff] mt-2">
                      {current.pinyin || "(no pinyin)"}
                    </div>
                  )}
                  {revealTrans[current.id] && (
                    <div className="text-[#a6a6a6] text-sm mt-2">
                      {current.definition || "(no definition)"}
                    </div>
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
                        ).sentences.map((s: any, idx: number) => (
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
                        ))}
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
                    className="px-3 py-1.5 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                  >
                    {revealPinyin[current.id] ? "Hide Pinyin" : "Reveal Pinyin"}
                  </button>
                  <button
                    onClick={() =>
                      setRevealTrans((r) => ({
                        ...r,
                        [current.id]: !r[current.id],
                      }))
                    }
                    className="px-3 py-1.5 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                  >
                    {revealTrans[current.id]
                      ? "Hide Meaning"
                      : "Reveal Meaning"}
                  </button>
                </div>
              </div>
              <div className="mt-6">
                <div className="text-[#a6a6a6] text-xs mb-2">
                  How well did you remember?
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[0, 1, 2, 3, 4, 5].map((q) => (
                    <button
                      key={q}
                      onClick={() => grade(current.id, q)}
                      className="px-2 py-2 bg-[#2e323a] border border-[#404040] rounded hover:border-[#4040f2] text-[#a6a6a6] text-xs cursor-pointer"
                      title={gradeHelp[q]}
                    >
                      <div className="font-medium">{q}</div>
                      <div className="sr-only">{gradeHelp[q]}</div>
                    </button>
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
                  ref={popupRef}
                  style={{
                    position: "absolute",
                    left: popupPos ? popupPos.left : popup.x,
                    top: popupPos ? popupPos.top : popup.y,
                    zIndex: 10,
                    visibility: popupPos ? "visible" : "hidden",
                    transform: "translate(-50%, 0)",
                  }}
                  className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
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
                  <div className="mt-3 pt-3 border-t border-[#404040]">
                    <button
                      onClick={() => {
                        void addWordToFlashcards(popup.word, undefined, {
                          pinyin: popup.pinyin,
                          definition:
                            popup.definition || popup.definitions?.[0],
                          hskLevel: popup.hskLevel,
                        });
                        setPopup((p) => ({ ...p, open: false }));
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
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
