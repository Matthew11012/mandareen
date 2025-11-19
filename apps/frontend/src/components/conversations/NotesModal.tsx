"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { NotesSection } from "@/components/lessons/NotesSection";
import { addSingleToFlashcards } from "@/lib/utils/flashcards";
import type { Message, MessageNotes } from "@/lib/api/conversations";
import { conversationsApi } from "@/lib/api/conversations";

// Local types for notes rendering
type SegToken = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
};
type Tip = { zh: string; pinyin?: string; en?: string; segments?: SegToken[] };
type GrammarNote = {
  point: string;
  pointPinyin?: string;
  pointEn?: string;
  brief: string;
  briefPinyin?: string;
  briefEn?: string;
  pointSegments?: SegToken[];
  briefSegments?: SegToken[];
  examples?: Tip[];
};
// Local type alias for type assertions (extends imported MessageNotes)
type LocalMessageNotes = MessageNotes & {
  grammarNotes?: GrammarNote[];
  tipsRich?: Tip[];
};

interface NotesModalProps {
  open: boolean;
  message: Message | null;
  conversationId: number | null;
  onClose: () => void;
  notesPinyinOn: boolean;
  onTogglePinyin: () => void;
}

export function NotesModal({
  open,
  message,
  conversationId,
  onClose,
  notesPinyinOn,
  onTogglePinyin,
}: NotesModalProps) {
  // Manual notes generation state
  // Check if notes actually exist (notes are now manual-only, so ignore _loadingNotes)
  const hasNotes = Boolean(
    message?.notes &&
      (((message.notes as LocalMessageNotes).grammarNotes?.length ?? 0) > 0 ||
        ((message.notes as LocalMessageNotes).tipsRich?.length ?? 0) > 0)
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Reset state when message changes
  useEffect(() => {
    setGenerateError(null);
    setQuotaExceeded(false);
  }, [message]);

  // Generate notes handler
  const handleGenerateNotes = async () => {
    if (!message || !conversationId || message.role !== "ai") return;
    setGenerating(true);
    setGenerateError(null);
    setQuotaExceeded(false);
    try {
      const res = await conversationsApi.generateManualNotes(
        conversationId,
        message.id
      );
      // Update local message.notes
      if (message) {
        (message as Message).notes = res.notes;
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to generate notes. Please try again.";
      setGenerateError(msg);

      // Detect quota exceeded
      if (typeof err === "object" && err !== null) {
        const errorObj = err as {
          status?: number;
          response?: { status?: number };
        };
        const status = errorObj.status ?? errorObj.response?.status;
        if (status === 429 || status === 403) {
          setQuotaExceeded(true);
        }
      }
    } finally {
      setGenerating(false);
    }
  };
  // Popup state for word definitions
  const [notesPopup, setNotesPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    ctx?: { hanzi?: string; pinyin?: string; translation?: string };
  }>({ open: false, x: 0, y: 0, word: "" });

  const notesPopupRef = useRef<HTMLDivElement | null>(null);
  const notesMobilePopupRef = useRef<HTMLDivElement | null>(null);
  const notesModalContentRef = useRef<HTMLDivElement | null>(null);

  // Handler adapter for NotesSection TokenRenderer popup using openFromElement
  // This maintains absolute positioning (current behavior)
  const handleNotesModalOpenFromElement = useCallback(
    (el: HTMLElement, data?: unknown, placement?: "above" | "below") => {
      // Placement is available but not used - we use absolute positioning instead
      void placement;
      const rect = el.getBoundingClientRect();
      const tokenData = data as
        | {
            word?: string;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }
        | undefined;

      setNotesPopup({
        open: true,
        x: rect.left + rect.width / 2,
        y: rect.top,
        word: tokenData?.word || "",
        pinyin: tokenData?.pinyin,
        definition: tokenData?.definition,
        definitions: tokenData?.definitions,
        ctx: message
          ? {
              hanzi: message.hanzi,
              pinyin: message.pinyin,
              translation: message.translation,
            }
          : undefined,
      });
    },
    [message]
  );

  // Handler adapter for NotesSection TokenRenderer popup using setPopup (fallback)
  const handleNotesModalPopup = useCallback(
    (popup: {
      open: boolean;
      x: number;
      y: number;
      anchorH: number;
      word: string;
      pinyin?: string;
      definition?: string;
      definitions?: string[];
      paraIndex?: number;
      tokenIndex?: number;
      hskLevel?: number;
    }) => {
      if (!popup.open) {
        setNotesPopup((p) => ({ ...p, open: false }));
        return;
      }
      // Convert container-relative coordinates to absolute
      const container = notesModalContentRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const absoluteX = containerRect.left + popup.x;
        const absoluteY = containerRect.top + popup.y;
        setNotesPopup({
          open: true,
          x: absoluteX,
          y: absoluteY,
          word: popup.word,
          pinyin: popup.pinyin,
          definition: popup.definition,
          definitions: popup.definitions,
          ctx: message
            ? {
                hanzi: message.hanzi,
                pinyin: message.pinyin,
                translation: message.translation,
              }
            : undefined,
        });
      } else {
        // Fallback: use provided coordinates directly
        setNotesPopup({
          open: true,
          x: popup.x,
          y: popup.y,
          word: popup.word,
          pinyin: popup.pinyin,
          definition: popup.definition,
          definitions: popup.definitions,
          ctx: message
            ? {
                hanzi: message.hanzi,
                pinyin: message.pinyin,
                translation: message.translation,
              }
            : undefined,
        });
      }
    },
    [message]
  );

  // Click outside handler for popup
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsideDesktop = notesPopupRef.current?.contains(target);
      const clickedInsideMobile = notesMobilePopupRef.current?.contains(target);
      // Only close if click is outside both popups
      if (!clickedInsideDesktop && !clickedInsideMobile) {
        setNotesPopup((p) => ({ ...p, open: false }));
      }
    };
    if (notesPopup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notesPopup.open]);

  // Render segments with popup for tips section
  const renderSegmentsWithPopup = (
    segments:
      | Array<{
          text: string;
          isWord?: boolean;
          pinyin?: string;
          definition?: string;
          definitions?: string[];
        }>
      | undefined,
    baseHanzi?: string,
    baseTranslation?: string,
    showPinyin: boolean = true
  ) => {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    // Build line-level pinyin by concatenating token pinyin for CJK tokens
    const linePinyin = segments
      .map((s) => (s.isWord && s.pinyin ? s.pinyin : ""))
      .filter(Boolean)
      .join(" ");
    return (
      <div className="leading-8 text-white font-inter text-[16px]">
        {segments.map((seg, idx) => {
          const isWord = Boolean(seg.isWord);
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {showPinyin && seg.pinyin ? (
                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                  {seg.pinyin}
                </span>
              ) : showPinyin ? (
                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                  •
                </span>
              ) : null}
              <span
                className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                title={seg.definition || ""}
                onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                  if (!isWord) return;
                  setNotesPopup({
                    open: true,
                    x: e.clientX,
                    y: e.clientY,
                    word: seg.text,
                    pinyin: seg.pinyin,
                    definition: seg.definition,
                    definitions: seg.definitions,
                    ctx: {
                      hanzi: baseHanzi,
                      pinyin: linePinyin,
                      translation: baseTranslation,
                    },
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
  };

  if (!open || !message) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative z-50 max-h-[80vh] w-[90vw] max-w-2xl bg-[#1d2128] border border-[#3a3f47] rounded-lg shadow-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e36] shrink-0">
            <div className="text-sm font-semibold text-white">Tutor Notes</div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="text-[#a6a6a6] text-xs hover:text-white cursor-pointer"
                aria-label="Close notes modal"
              >
                Close
              </button>
            </div>
          </div>
          <div
            className="p-2 sm:p-4 overflow-y-auto space-y-3 flex-1"
            ref={notesModalContentRef}
          >
            {Array.isArray(message.notes?.grammarNotes) &&
            message.notes!.grammarNotes!.length > 0 ? (
              <NotesSection
                title="Notes"
                notes={
                  message.notes!.grammarNotes! as unknown as Array<{
                    point: string;
                    pointPinyin?: string;
                    pointEn?: string;
                    brief: string;
                    briefPinyin?: string;
                    briefEn?: string;
                    pointSegments?: Array<{
                      text: string;
                      isWord?: boolean;
                      pinyin?: string;
                      definition?: string;
                      definitions?: string[];
                    }>;
                    briefSegments?: Array<{
                      text: string;
                      isWord?: boolean;
                      pinyin?: string;
                      definition?: string;
                      definitions?: string[];
                    }>;
                    examples?: Array<{
                      zh: string;
                      en?: string;
                      pinyin?: string;
                      segments?: Array<{
                        text: string;
                        isWord?: boolean;
                        pinyin?: string;
                        definition?: string;
                        definitions?: string[];
                      }>;
                    }>;
                  }>
                }
                notesPinyinOn={notesPinyinOn}
                onTogglePinyin={onTogglePinyin}
                sectionKey="story"
                multiSelect={false}
                selectedWords={{}}
                toggleSelectWord={undefined}
                contentRef={notesModalContentRef}
                setPopup={handleNotesModalPopup}
                openFromElement={handleNotesModalOpenFromElement}
                hskUnderlineClass={() => ""}
                maxItems={Infinity}
              />
            ) : null}
            {Array.isArray((message.notes as LocalMessageNotes)?.tipsRich) &&
            (message.notes as LocalMessageNotes).tipsRich!.length > 0 ? (
              <div className="pt-2 border-t border-[#2a2e36]">
                <div className="text-sm font-semibold text-white mb-2">
                  Tips
                </div>
                <ul className="space-y-2 list-disc list-outside pl-5 marker:text-[#596080]">
                  {(message.notes as LocalMessageNotes).tipsRich!.map(
                    (t: Tip, i: number) => (
                      <li key={i}>
                        {Array.isArray(t.segments) && t.segments.length > 0 ? (
                          <>
                            {renderSegmentsWithPopup(
                              t.segments,
                              t.zh,
                              t.en,
                              notesPinyinOn
                            )}
                            {t.en ? (
                              <div className="text-[#8b949e] text-sm">
                                {t.en}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="text-[#c9d1d9]">{t.zh}</div>
                            {t.pinyin ? (
                              <div className="text-[#9aa6ff] text-xs">
                                {t.pinyin}
                              </div>
                            ) : null}
                            {t.en ? (
                              <div className="text-[#8b949e] text-xs">
                                {t.en}
                              </div>
                            ) : null}
                          </>
                        )}
                      </li>
                    )
                  )}
                </ul>
              </div>
            ) : null}

            {/* Manual Notes Generation Section */}
            {/* Show generate button for AI messages without notes */}
            {conversationId && message.role === "ai" && !hasNotes && (
              <div className="mt-4 border-t border-[#2a2e36] pt-4">
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Generate Notes
                    </h3>
                    <p className="text-xs text-white/70">
                      Generate grammar notes and tips for this AI response.
                    </p>
                  </div>
                  {generateError && (
                    <p className="text-xs text-red-400" role="alert">
                      {generateError}
                    </p>
                  )}
                  {quotaExceeded && (
                    <p className="text-xs text-amber-300" role="alert">
                      You&apos;ve reached the manual notes generation limit for
                      your plan.{" "}
                      <Link
                        href="/pricing"
                        className="underline hover:text-amber-200"
                      >
                        View plans
                      </Link>{" "}
                      to increase your quota.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateNotes}
                    disabled={generating}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101218]"
                    aria-label={
                      generating ? "Generating notes" : "Generate notes"
                    }
                  >
                    {generating ? (
                      <>
                        <Loader2
                          className="w-4 h-4 animate-spin"
                          aria-hidden="true"
                        />
                        <span>Generating notes…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" aria-hidden="true" />
                        <span>Generate Notes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop popup */}
      {notesPopup.open && (
        <div
          ref={notesPopupRef}
          style={{
            position: "fixed",
            left: Math.max(
              10,
              Math.min(notesPopup.x - 110, window.innerWidth - 260)
            ),
            top: Math.max(10, notesPopup.y - 150),
            zIndex: 1000,
          }}
          className="hidden sm:block bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
        >
          <div className="font-bold text-white text-lg truncate">
            {notesPopup.word}
          </div>
          {notesPopup.pinyin ? (
            <div className="text-[#c6ceff] text-sm font-medium truncate">
              {notesPopup.pinyin}
            </div>
          ) : null}
          {Array.isArray(notesPopup.definitions) &&
          notesPopup.definitions.length > 0 ? (
            <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
              {notesPopup.definitions.map((d, i) => (
                <div key={i}>• {d}</div>
              ))}
            </div>
          ) : notesPopup.definition ? (
            <div className="text-xs text-[#a6a6a6] mt-2">
              {notesPopup.definition}
            </div>
          ) : null}
          <div className="mt-3 pt-3 border-t border-[#404040]">
            <button
              onClick={() => {
                void addSingleToFlashcards(notesPopup.word, notesPopup.ctx);
                setNotesPopup((p) => ({ ...p, open: false }));
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-inter">Add to Flashcards</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile top sheet popup */}
      <AnimatePresence>
        {notesPopup.open && (
          <motion.div
            ref={notesMobilePopupRef}
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
                  {notesPopup.word}
                </div>
              </div>
              {notesPopup.pinyin ? (
                <div className="text-[#c6ceff] text-sm font-medium truncate mb-2">
                  {notesPopup.pinyin}
                </div>
              ) : null}
              {Array.isArray(notesPopup.definitions) &&
              notesPopup.definitions.length > 0 ? (
                <div className="text-xs text-[#a6a6a6] mb-3 space-y-1">
                  {notesPopup.definitions.map((d, i) => (
                    <div key={i}>• {d}</div>
                  ))}
                </div>
              ) : notesPopup.definition ? (
                <div className="text-xs text-[#a6a6a6] mb-3">
                  {notesPopup.definition}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setNotesPopup((p) => ({ ...p, open: false }));
                  }}
                  className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await addSingleToFlashcards(
                      notesPopup.word,
                      notesPopup.ctx
                    );
                    setNotesPopup((p) => ({ ...p, open: false }));
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-inter">Add to Flashcards</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
