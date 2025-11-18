"use client";

import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { TokenRenderer } from "@/components/lessons/TokenRenderer";
import type { TokenRendererProps } from "@/components/lessons/TokenRenderer";
import { buildFallbackSegments } from "@/lib/utils/segments";
import {
  addSingleToFlashcards,
  getSentenceContext,
} from "@/lib/utils/flashcards";
import type { Message } from "@/lib/api/conversations";
import { usePopup } from "@/hooks/usePopup";

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
type MessageNotes = {
  grammarNotes?: GrammarNote[];
  tipsRich?: Tip[];
};

// TranslationBlock component (simple memo component)
const TranslationBlock = ({ show, text }: { show: boolean; text?: string }) => {
  if (!show || !text) return null;
  return <div className="text-[#a6a6a6] text-sm mt-1">{text}</div>;
};

interface AiMessageProps {
  message: Message;
  showPinyin: boolean;
  showTranslation: boolean;
  showNotes: boolean;
  onOpenNotesModal: (message: Message) => void;
  containerRef: React.RefObject<HTMLElement | null>;
}

type PopupData = {
  word: string;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
  tokenIndex?: number;
};

export function AiMessage({
  message,
  showPinyin,
  showTranslation,
  showNotes,
  onOpenNotesModal,
  containerRef,
}: AiMessageProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const mobilePopupRef = useRef<HTMLDivElement | null>(null);

  const {
    popupRef,
    state: popup,
    position: popupPos,
    openFromElement: openPopupFromElement,
    openAtPoint: openPopupAtPoint,
    close: closePopup,
  } = usePopup<PopupData>({
    containerRef,
    toolbarSelector: undefined,
    margin: 8,
  });

  // Adapter to handle TokenRenderer's openFromElement callback
  const handleOpenFromElement = useCallback(
    (el: HTMLElement, data?: unknown, placement?: "above" | "below") => {
      void placement;
      const tokenData = data as
        | {
            word?: string;
            pinyin?: string;
            definition?: string;
            definitions?: string[];
          }
        | undefined;

      // Find token index by searching through segments
      let tokenIndex = -1;
      if (Array.isArray(message.segments)) {
        const wordText = tokenData?.word || "";
        for (let i = 0; i < message.segments.length; i++) {
          if (message.segments[i].text === wordText) {
            tokenIndex = i;
            break;
          }
        }
      }

      openPopupFromElement(el, {
        word: tokenData?.word || "",
        pinyin: tokenData?.pinyin,
        definition: tokenData?.definition,
        definitions: tokenData?.definitions,
        tokenIndex,
      });
    },
    [message.segments, openPopupFromElement]
  );

  // Render pinyin above hanzi for notes; skip non-CJK like "OK"/"Alright" tokens.
  const renderNotesPinyin = (
    hanzi?: string,
    pinyin?: string,
    showPinyinState: boolean = true
  ) => {
    if (!hanzi) return null;
    const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
    const tokens = (pinyin || "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    let pi = 0;
    const chars = Array.from(hanzi);
    return (
      <div className="leading-8 text-white font-inter text-[16px]">
        {chars.map((ch, idx) => {
          let top = "";
          if (isCJK(ch)) top = tokens[pi++] || "";
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {showPinyinState && top ? (
                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                  {top}
                </span>
              ) : (
                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                  •
                </span>
              )}
              <span className="px-[1px] rounded">{ch}</span>
            </span>
          );
        })}
      </div>
    );
  };

  // Render segments with popup for notes (uses AiMessage popup state)
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
    showPinyinState: boolean = true
  ) => {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    return (
      <div className="leading-8 text-white font-inter text-[16px]">
        {segments.map((seg, idx) => {
          const isWord = Boolean(seg.isWord);
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {showPinyinState && seg.pinyin ? (
                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                  {seg.pinyin}
                </span>
              ) : showPinyinState ? (
                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                  •
                </span>
              ) : null}
              <span
                className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                title={seg.definition || ""}
                onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                  if (!isWord) return;
                  const anchor = e.currentTarget.getBoundingClientRect();
                  openPopupAtPoint({
                    clientX: anchor.left + anchor.width / 2,
                    clientY: anchor.top,
                    anchorHeight: anchor.height,
                    data: {
                      word: seg.text,
                      pinyin: seg.pinyin,
                      definition: seg.definition,
                      definitions: seg.definitions,
                      tokenIndex: undefined, // Notes segments don't have token index
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

  const renderAligned = (hanzi: string, pinyin?: string) => {
    // If segments exist, use TokenRenderer
    if (Array.isArray(message.segments) && message.segments.length > 0) {
      return (
        <TokenRenderer
          segments={
            message.segments as unknown as TokenRendererProps["segments"]
          }
          fallbackZh={hanzi}
          showPinyin={showPinyin}
          keyPrefix={`conversation-msg-${message.id}`}
          textSizeClass="text-base"
          openFromElement={handleOpenFromElement}
          contentRef={contentRef}
          contextSentenceZh={message.hanzi}
          contextSentenceTranslation={message.translation}
          applyHSKUnderline={false}
        />
      );
    }
    // Fallback: build segments from hanzi and pinyin
    const fallbackSegs = buildFallbackSegments(hanzi, pinyin);
    if (fallbackSegs.length > 0) {
      return (
        <TokenRenderer
          segments={fallbackSegs as unknown as TokenRendererProps["segments"]}
          fallbackZh={hanzi}
          showPinyin={showPinyin}
          keyPrefix={`conversation-msg-${message.id}-fallback`}
          textSizeClass="text-base"
          openFromElement={handleOpenFromElement}
          contentRef={contentRef}
          contextSentenceZh={message.hanzi}
          contextSentenceTranslation={message.translation}
          applyHSKUnderline={false}
        />
      );
    }
    // Ultimate fallback: per-character alignment (no segments at all)
    const chars = Array.from(hanzi || "");
    const ps = (pinyin || "").split(/\s+/).filter(Boolean);
    let pi = 0;
    const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
    return (
      <div className="leading-8 text-white font-inter text-[16px]">
        {chars.map((ch, idx) => {
          const top = showPinyin && isCJK(ch) ? ps[pi] || "" : "";
          if (isCJK(ch)) pi++;
          return (
            <span
              key={idx}
              className="inline-flex flex-col items-center align-top mr-[2px]"
            >
              {top ? (
                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
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

  const NotesBlock = () => {
    const has =
      Array.isArray(message.notes?.grammarNotes) &&
      message.notes!.grammarNotes!.length > 0;
    if (!has) return null;
    return (
      <div className="mt-2 border border-[#3a3f47] rounded-md bg-[#1d2128] p-2">
        <div className="text-xs font-semibold text-white mb-1">Tutor Notes</div>
        <div className="space-y-3 max-h-56 overflow-hidden relative">
          {message
            .notes!.grammarNotes!.slice(0, 2)
            .map((gn: GrammarNote, idx: number) => (
              <div
                key={idx}
                className="text-[12px] text-[#c9d1d9] border border-[#2a2e36] bg-[#1a1f27] rounded-lg p-2 space-y-2"
              >
                {/* Point */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                      Point
                    </span>
                  </div>
                  <div>
                    {Array.isArray(gn.pointSegments) &&
                    gn.pointSegments.length > 0
                      ? renderSegmentsWithPopup(
                          gn.pointSegments,
                          gn.point,
                          gn.pointEn,
                          showPinyin
                        )
                      : renderNotesPinyin(gn.point, gn.pointPinyin, showPinyin)}
                  </div>
                  {gn.pointEn ? (
                    <div className="text-[11px] text-[#8b949e]">
                      {gn.pointEn}
                    </div>
                  ) : null}
                </div>

                {/* Brief */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                      Brief
                    </span>
                  </div>
                  <div>
                    {Array.isArray(gn.briefSegments) &&
                    gn.briefSegments.length > 0
                      ? renderSegmentsWithPopup(
                          gn.briefSegments,
                          gn.brief,
                          gn.briefEn,
                          showPinyin
                        )
                      : renderNotesPinyin(gn.brief, gn.briefPinyin, showPinyin)}
                  </div>
                  {gn.briefEn ? (
                    <div className="text-[11px] text-[#8b949e]">
                      {gn.briefEn}
                    </div>
                  ) : null}
                </div>

                {/* Examples */}
                {Array.isArray(gn.examples) && gn.examples.length > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                        Examples
                      </span>
                    </div>
                    <ul className="space-y-1 list-disc list-outside pl-4 marker:text-[#596080]">
                      {gn.examples.map((ex: Tip, i: number) => (
                        <li key={i}>
                          {Array.isArray(ex.segments) ? (
                            renderSegmentsWithPopup(
                              ex.segments,
                              ex.zh,
                              ex.en,
                              showPinyin
                            )
                          ) : (
                            <>
                              <div className="text-[#c9d1d9]">{ex.zh}</div>
                              {showPinyin && ex.pinyin ? (
                                <div className="text-[#9aa6ff] text-xs">
                                  {ex.pinyin}
                                </div>
                              ) : null}
                              {ex.en ? (
                                <div className="text-[#8b949e] text-xs">
                                  {ex.en}
                                </div>
                              ) : null}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          {message.notes!.grammarNotes!.length > 2 ? (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#1d2128] to-transparent" />
          ) : null}
        </div>
        {Array.isArray((message.notes as MessageNotes).tipsRich) &&
        (message.notes as MessageNotes).tipsRich!.length > 0 ? (
          <div className="mt-2 pt-2 border-t border-[#2a2e36]">
            <div className="text-[10px] uppercase tracking-wide text-[#8a8f99] mb-1">
              Tips
            </div>
            <ul className="space-y-1 list-disc list-outside pl-4 marker:text-[#596080]">
              {(message.notes as MessageNotes)
                .tipsRich!.slice(0, 2)
                .map((t, i) => (
                  <li key={i}>
                    {Array.isArray(t.segments) && t.segments.length > 0 ? (
                      <>
                        {renderSegmentsWithPopup(
                          t.segments,
                          t.zh,
                          t.en,
                          showPinyin
                        )}
                        {t.en ? (
                          <div className="text-[#8b949e] text-xs">{t.en}</div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="text-[#c9d1d9]">{t.zh}</div>
                        {showPinyin && t.pinyin ? (
                          <div className="text-[#9aa6ff] text-xs">
                            {t.pinyin}
                          </div>
                        ) : null}
                        {t.en ? (
                          <div className="text-[#8b949e] text-xs">{t.en}</div>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-2 flex justify-between items-center">
          <div className="text-[11px] text-[#a6a6a6]">
            {Array.isArray((message.notes as MessageNotes).tipsRich) &&
            (message.notes as MessageNotes).tipsRich!.length > 0
              ? `${(message.notes as MessageNotes).tipsRich!.length} tips available`
              : null}
          </div>
          <button
            onClick={() => onOpenNotesModal(message)}
            className="text-[11px] px-2 py-1 rounded border border-[#404040] hover:border-[#4040f2] text-[#c9d1d9] cursor-pointer"
          >
            View all notes
          </button>
        </div>
      </div>
    );
  };

  return (
    <div ref={contentRef}>
      {renderAligned(message.hanzi, message.pinyin)}
      <TranslationBlock show={showTranslation} text={message.translation} />
      {showNotes ? <NotesBlock /> : null}
      {popup.open &&
        containerRef.current &&
        createPortal(
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
            className="hidden sm:block bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
          >
          <div className="font-bold text-white text-lg truncate">
            {popup.data?.word}
          </div>
          {popup.data?.pinyin && (
            <div className="text-[#c6ceff] text-sm font-medium truncate">
              {popup.data.pinyin}
            </div>
          )}
          {Array.isArray(popup.data?.definitions) &&
          (popup.data?.definitions?.length || 0) > 0 ? (
            <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
              {(popup.data.definitions as string[]).map((d, i) => (
                <div key={i}>• {d}</div>
              ))}
            </div>
          ) : popup.data?.definition ? (
            <div className="text-xs text-[#a6a6a6] mt-2">
              {popup.data.definition}
            </div>
          ) : null}
          <div className="mt-3 pt-3 border-t border-[#404040]">
            <button
              onClick={() => {
                // Build sentence-level context using segments and token index
                const tokenIndex = popup.data?.tokenIndex ?? -1;
                const ctx =
                  tokenIndex >= 0
                    ? getSentenceContext(message, tokenIndex)
                    : undefined;
                void addSingleToFlashcards(popup.data?.word || "", ctx);
                closePopup();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#4040f2] text-white rounded-lg hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-inter">Add to Flashcards</span>
            </button>
          </div>
          </div>,
          containerRef.current
        )}

      {/* Mobile top sheet popup for AiMessage */}
      <AnimatePresence>
        {popup.open && (
          <motion.div
            ref={mobilePopupRef}
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
                  {popup.data?.word}
                </div>
              </div>
              {popup.data?.pinyin && (
                <div className="text-[#c6ceff] text-sm font-medium truncate mb-2">
                  {popup.data.pinyin}
                </div>
              )}
              {Array.isArray(popup.data?.definitions) &&
              (popup.data?.definitions?.length || 0) > 0 ? (
                <div className="text-xs text-[#a6a6a6] mb-3 space-y-1">
                  {(popup.data.definitions as string[]).map((d, i) => (
                    <div key={i}>• {d}</div>
                  ))}
                </div>
              ) : popup.data?.definition ? (
                <div className="text-xs text-[#a6a6a6] mb-3">
                  {popup.data.definition}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    closePopup();
                  }}
                  className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] cursor-pointer text-sm"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    // Build sentence-level context using segments and token index
                    const tokenIndex = popup.data?.tokenIndex ?? -1;
                    const ctx =
                      tokenIndex >= 0
                        ? getSentenceContext(message, tokenIndex)
                        : undefined;
                    await addSingleToFlashcards(popup.data?.word || "", ctx);
                    closePopup();
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
    </div>
  );
}
