"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { TokenRenderer } from "./TokenRenderer";
import type { TokenRendererProps, SelectedWord } from "./TokenRenderer";

type LessonToken = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
  hskLevel?: number;
};

type DialogueTurn = {
  speaker: string;
  hanzi: string;
  pinyin?: string;
  translation?: string;
  segments?: LessonToken[];
};

export function DialogueSection({
  turns,
  isTurnPinyinOn,
  isTurnTransOn,
  setTurnPinyinOn,
  setTurnTransOn,
  hskUnderlineClass,
  multiSelect,
  selectedWords,
  toggleSelectWord,
  contentRef,
  setPopup,
}: {
  turns: DialogueTurn[];
  isTurnPinyinOn: (idx: number) => boolean;
  isTurnTransOn: (idx: number) => boolean;
  setTurnPinyinOn: (
    next:
      | Record<number, boolean | null>
      | ((s: Record<number, boolean | null>) => Record<number, boolean | null>)
  ) => void;
  setTurnTransOn: (
    next:
      | Record<number, boolean | null>
      | ((s: Record<number, boolean | null>) => Record<number, boolean | null>)
  ) => void;
  hskUnderlineClass: (level?: number) => string;
  multiSelect: boolean;
  selectedWords: Record<string, unknown>;
  toggleSelectWord: (
    key: string,
    text: string,
    pinyin: string | undefined,
    paraIndex: number,
    tokenIndex: number,
    contextZh?: string,
    contextEn?: string
  ) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  setPopup: (popup: {
    open: boolean;
    x: number;
    y: number;
    anchorH: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
    hskLevel?: number;
  }) => void;
}) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mt-6">
      {turns.map((turn, ti) => (
        <div
          key={ti}
          className="sm:bg-[#262a31] rounded-lg p-3 sm:border sm:border-[#3a3a3a] overflow-x-hidden"
        >
          <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
            <div className="text-[#9aa6ff] font-inter text-sm truncate min-w-0">
              {turn.speaker}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setTurnPinyinOn((s) => ({ ...s, [ti]: !s[ti] }))}
                className={`px-2 py-1 text-xs rounded border ${isTurnPinyinOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31]`}
                type="button"
                aria-pressed={isTurnPinyinOn(ti)}
                aria-label={
                  isTurnPinyinOn(ti)
                    ? "Hide pinyin for this turn"
                    : "Show pinyin for this turn"
                }
              >
                Pinyin {isTurnPinyinOn(ti) ? "On" : "Off"}
              </button>
              <button
                onClick={() => setTurnTransOn((s) => ({ ...s, [ti]: !s[ti] }))}
                className={`px-2 py-1 text-xs rounded border ${isTurnTransOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#262a31]`}
                type="button"
                aria-pressed={isTurnTransOn(ti)}
                aria-label={
                  isTurnTransOn(ti)
                    ? "Hide translation for this turn"
                    : "Show translation for this turn"
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 26 25"
                  fill="none"
                  aria-hidden="true"
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
          <Separator className="mb-2 border-1 opacity-50 sm:hidden" />
          <div className="leading-10 font-light sm:font-normal text-white font-inter text-[18px]">
            <TokenRenderer
              segments={
                turn.segments as unknown as TokenRendererProps["segments"]
              }
              showPinyin={isTurnPinyinOn(ti)}
              keyPrefix={`dialogue-turn${ti}`}
              multiSelect={multiSelect}
              selectedWords={
                selectedWords as unknown as Record<string, SelectedWord>
              }
              toggleSelectWord={
                toggleSelectWord as unknown as TokenRendererProps["toggleSelectWord"]
              }
              selectionIndexContext={{ turnIndex: ti }}
              setPopup={setPopup as unknown as TokenRendererProps["setPopup"]}
              contentRef={contentRef}
              applyHSKUnderline={true}
              hskUnderlineClass={hskUnderlineClass}
            />
          </div>
          <AnimatePresence initial={false}>
            {isTurnTransOn(ti) && turn.translation && (
              <motion.div
                key={`turn-translation-${ti}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                style={{ overflow: "hidden" }}
                className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3 mt-2"
              >
                {turn.translation}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
