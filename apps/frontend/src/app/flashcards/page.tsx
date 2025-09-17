"use client";

import { useEffect, useMemo, useState } from "react";
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

  // Sentence renderer: pinyin above hanzi per character
  const renderSentenceWithPinyin = (hanzi: string, pinyin?: string) => {
    if (!current) return null;
    const tokens = (pinyin || "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    let pi = 0;
    const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
    const chars = Array.from(hanzi || "");
    return (
      <div className="leading-8 text-white font-inter text-[18px]">
        {chars.map((ch, idx) => {
          const top =
            revealPinyin[current.id] && isCJK(ch) ? tokens[pi++] || "" : "";
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {top ? (
                <span className="text-xs text-[#c6ceff] leading-none mb-[2px]">
                  {top}
                </span>
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
            <div className="w-full max-w-xl bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
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
                        ).sentences.map(
                          (
                            s: {
                              hanzi: string;
                              pinyin?: string;
                              translation?: string;
                            },
                            idx: number
                          ) => (
                            <div
                              key={idx}
                              className="bg-[#262a31] rounded p-3 border border-[#3a3a3a]"
                            >
                              {renderSentenceWithPinyin(s.hanzi, s.pinyin)}
                              {revealTrans[current.id] && s.translation && (
                                <div className="text-[#a6a6a6] text-sm mt-1">
                                  {s.translation}
                                </div>
                              )}
                            </div>
                          )
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
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
