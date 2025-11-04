"use client";

import React, { MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

type LessonToken = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
  hskLevel?: number;
};

export function StorySection({
  segmentedParagraphs,
  translationParagraphs,
  isChunkPinyinOn,
  isChunkTransOn,
  setChunkPinyinOn,
  setChunkTransOn,
  hskUnderlineClass,
  multiSelect,
  selectedWords,
  toggleSelectWord,
  contentRef,
  setPopup,
  MobileStoryTrackPager,
}: {
  segmentedParagraphs: LessonToken[][];
  translationParagraphs: Array<string | undefined>;
  isChunkPinyinOn: (idx: number) => boolean;
  isChunkTransOn: (idx: number) => boolean;
  setChunkPinyinOn: (
    next:
      | Record<number, boolean | null>
      | ((s: Record<number, boolean | null>) => Record<number, boolean | null>)
  ) => void;
  setChunkTransOn: (
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
    tokenIndex: number
  ) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  setPopup: React.Dispatch<
    React.SetStateAction<{
      open: boolean;
      x: number;
      y: number;
      anchorH?: number;
      word: string;
      pinyin?: string;
      definition?: string;
      definitions?: string[];
      paraIndex?: number;
      tokenIndex?: number;
      hskLevel?: number;
    }>
  >;
  MobileStoryTrackPager: React.ComponentType<{
    segmentedParagraphs: LessonToken[][];
    translationParagraphs: Array<string | undefined>;
    isChunkPinyinOn: (idx: number) => boolean;
    isChunkTransOn: (idx: number) => boolean;
    setChunkPinyinOn: React.Dispatch<
      React.SetStateAction<Record<number, boolean | null>>
    >;
    setChunkTransOn: React.Dispatch<
      React.SetStateAction<Record<number, boolean | null>>
    >;
    hskUnderlineClass: (level?: number) => string;
    multiSelect: boolean;
    selectedWords: Record<string, unknown>;
    toggleSelectWord: (
      key: string,
      text: string,
      pinyin: string | undefined,
      paraIndex: number,
      tokenIndex: number
    ) => void;
    contentRef: React.RefObject<HTMLDivElement | null>;
    setPopup: React.Dispatch<
      React.SetStateAction<{
        open: boolean;
        x: number;
        y: number;
        anchorH?: number;
        word: string;
        pinyin?: string;
        definition?: string;
        definitions?: string[];
        paraIndex?: number;
        tokenIndex?: number;
        hskLevel?: number;
      }>
    >;
  }>;
}) {
  return (
    <>
      {/* Mobile: swipeable pager */}
      <div className="sm:hidden">
        <MobileStoryTrackPager
          segmentedParagraphs={segmentedParagraphs}
          translationParagraphs={translationParagraphs}
          isChunkPinyinOn={isChunkPinyinOn}
          isChunkTransOn={isChunkTransOn}
          setChunkPinyinOn={setChunkPinyinOn}
          setChunkTransOn={setChunkTransOn}
          hskUnderlineClass={hskUnderlineClass}
          multiSelect={multiSelect}
          selectedWords={selectedWords}
          toggleSelectWord={toggleSelectWord}
          contentRef={contentRef}
          setPopup={setPopup}
        />
      </div>

      {/* Desktop: original list rendering */}
      <div className="space-y-6 pr-0 py-2 hidden sm:block">
        {segmentedParagraphs.map((segChunk, ci) => (
          <div key={ci} className="space-y-2">
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() =>
                  setChunkPinyinOn((s) => ({ ...s, [ci]: !s[ci] }))
                }
                className={`px-2 py-1 text-xs rounded border ${isChunkPinyinOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]`}
                type="button"
                aria-pressed={isChunkPinyinOn(ci)}
                aria-label={
                  isChunkPinyinOn(ci)
                    ? "Hide pinyin for paragraph"
                    : "Show pinyin for paragraph"
                }
              >
                Pinyin {isChunkPinyinOn(ci) ? "On" : "Off"}
              </button>
              <button
                onClick={() => setChunkTransOn((s) => ({ ...s, [ci]: !s[ci] }))}
                className={`px-2 py-1 text-xs rounded border ${isChunkTransOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#2e323a]`}
                type="button"
                aria-pressed={isChunkTransOn(ci)}
                aria-label={
                  isChunkTransOn(ci)
                    ? "Hide translation for paragraph"
                    : "Show translation for paragraph"
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
            <div className="leading-10 font-thin sm:font-normal text-white font-inter sm:text-[18px] text-xl">
              {segChunk.map((seg: LessonToken, idx) => {
                const isWord = Boolean(seg.isWord);
                return (
                  <span
                    key={`${ci}-${idx}`}
                    className={`inline-flex flex-col items-center align-top mr-[2px]`}
                  >
                    {isChunkPinyinOn(ci) ? (
                      isWord && seg.pinyin ? (
                        <span className="text-xs text-[#9aa6ff] font-normal leading-none">
                          {seg.pinyin}
                        </span>
                      ) : (
                        <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                          •
                        </span>
                      )
                    ) : null}
                    <span
                      className={`flex items-start px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                      title={seg.definition || ""}
                      onClick={(e: ReactMouseEvent<HTMLSpanElement>) => {
                        if (!isWord) return;
                        if (multiSelect) {
                          toggleSelectWord(
                            `${ci}-${idx}-${seg.text}`,
                            seg.text,
                            seg.pinyin,
                            ci,
                            idx
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
                          paraIndex: ci,
                          tokenIndex: idx,
                          hskLevel: seg.hskLevel as number | undefined,
                        });
                      }}
                    >
                      <span
                        className={`underline-offset-[3px] ${hskUnderlineClass(seg.hskLevel)}`}
                      >
                        {seg.text}
                      </span>
                    </span>
                  </span>
                );
              })}
            </div>
            <AnimatePresence initial={false}>
              {isChunkTransOn(ci) && translationParagraphs[ci] && (
                <motion.div
                  key={`chunk-translation-${ci}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                  className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3"
                >
                  {translationParagraphs[ci]}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </>
  );
}
