"use client";

import React, { MouseEvent as ReactMouseEvent, useCallback } from "react";

export type LessonToken = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
  hskLevel?: number;
};

export type SelectedWord = {
  text: string;
  pinyin?: string;
  paraIndex?: number;
  tokenIndex?: number;
  contextZh?: string;
  contextEn?: string;
};

export type TokenRendererProps = {
  segments?: LessonToken[];
  fallbackZh?: string;
  showPinyin?: boolean;
  hoverClass?: string;
  keyPrefix: string; // e.g., "story-para0", "dialogue-turn1", "quiz-q0", etc.
  textSizeClass?: string; // optional override for root text size, defaults to text-lg

  // Selection (multi-select)
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
  selectionIndexContext?: {
    paraIndex?: number;
    turnIndex?: number;
    special?: number;
  };

  // Popup (single-select)
  setPopup?: (popup: {
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
  }) => void;
  openFromElement?: (
    el: HTMLElement,
    data?: unknown,
    placement?: "above" | "below"
  ) => void;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  contextSentenceZh?: string;
  contextSentenceTranslation?: string;

  // Rendering flags
  applyHSKUnderline?: boolean; // default true; set false in Quiz
  hskUnderlineClass?: (level?: number) => string;
};

export const TokenRenderer = React.memo(function TokenRenderer({
  segments,
  fallbackZh,
  showPinyin,
  hoverClass,
  keyPrefix,
  textSizeClass = "text-lg",
  multiSelect,
  selectedWords,
  toggleSelectWord,
  selectionIndexContext,
  setPopup,
  openFromElement,
  contentRef,
  contextSentenceZh,
  contextSentenceTranslation,
  applyHSKUnderline = true,
  hskUnderlineClass,
}: TokenRendererProps) {
  const getKeyFor = useCallback(
    (idx: number, text: string) => `${keyPrefix}-${idx}-${text}`,
    [keyPrefix]
  );

  const getIndexForSelection = useCallback(
    (fallbackIdx: number) => {
      // Normalize para/turn/special index into paraIndex for the legacy toggle signature
      if (selectionIndexContext?.special !== undefined)
        return selectionIndexContext.special;
      if (selectionIndexContext?.turnIndex !== undefined)
        return selectionIndexContext.turnIndex;
      if (selectionIndexContext?.paraIndex !== undefined)
        return selectionIndexContext.paraIndex;
      return fallbackIdx;
    },
    [selectionIndexContext]
  );

  if (!Array.isArray(segments) || segments.length === 0) {
    return <>{fallbackZh}</>;
  }

  return (
    <div
      className={`leading-8 text-white font-light sm:font-normal ${textSizeClass}`}
    >
      {segments.map((seg, idx) => {
        const isWord = Boolean(seg.isWord);
        const selectionKey = getKeyFor(idx, seg.text);
        const selected = Boolean(selectedWords && selectedWords[selectionKey]);
        return (
          <span
            key={idx}
            className="inline-flex flex-col items-center align-top mr-[2px]"
          >
            {showPinyin ? (
              isWord && seg.pinyin ? (
                <span className="text-[11px] text-[#9aa6ff] font-normal leading-none">
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
              role={isWord ? "button" : undefined}
              tabIndex={isWord ? 0 : undefined}
              aria-pressed={isWord ? selected : undefined}
              onClick={(e: ReactMouseEvent<HTMLSpanElement>) => {
                if (!isWord) return;

                if (multiSelect && toggleSelectWord) {
                  const paraIdx = getIndexForSelection(-2);
                  toggleSelectWord(
                    selectionKey,
                    seg.text,
                    seg.pinyin,
                    paraIdx,
                    idx,
                    contextSentenceZh,
                    contextSentenceTranslation
                  );
                  return;
                }

                const currentEl = e.currentTarget as HTMLSpanElement;
                if (openFromElement) {
                  openFromElement(currentEl, {
                    word: seg.text,
                    pinyin: seg.pinyin,
                    definition: seg.definition,
                    definitions: seg.definitions,
                    hskLevel: seg.hskLevel,
                  });
                  return;
                }
                if (setPopup) {
                  const anchor = currentEl.getBoundingClientRect();
                  const container =
                    contentRef?.current?.getBoundingClientRect();
                  const px = container
                    ? anchor.left - container.left + anchor.width / 2
                    : anchor.left + anchor.width / 2;
                  const py = container
                    ? anchor.top - container.top
                    : anchor.top;
                  setPopup({
                    open: true,
                    x: px,
                    y: py,
                    anchorH: anchor.height,
                    word: seg.text,
                    pinyin: seg.pinyin,
                    definition: seg.definition,
                    definitions: seg.definitions,
                    paraIndex: getIndexForSelection(-2),
                    tokenIndex: idx,
                    hskLevel: seg.hskLevel,
                  });
                }
              }}
              onKeyDown={(e) => {
                if (!isWord) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  (e.currentTarget as HTMLSpanElement).click();
                }
              }}
            >
              <span
                className={`flex ${
                  (multiSelect && selected ? "bg-[#4040f2]/80 rounded " : "") +
                  (applyHSKUnderline &&
                  isWord &&
                  typeof seg.hskLevel === "number" &&
                  hskUnderlineClass
                    ? hskUnderlineClass(seg.hskLevel)
                    : "")
                }`}
              >
                {seg.text}
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
});
