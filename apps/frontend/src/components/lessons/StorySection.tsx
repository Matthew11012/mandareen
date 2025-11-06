"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useMotionValue,
  animate,
} from "framer-motion";
import { TokenRenderer } from "./TokenRenderer";
import type {
  TokenRendererProps,
  LessonToken as TRToken,
  SelectedWord as TRSelectedWord,
} from "./TokenRenderer";

type LessonToken = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
  hskLevel?: number;
};

type MobileStoryTrackPagerProps = {
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
  openFromElement?: TokenRendererProps["openFromElement"];
};

function MobileStoryTrackPager({
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
  openFromElement,
}: MobileStoryTrackPagerProps) {
  const prefersReducedMotion = useReducedMotion();
  const pathname = usePathname();

  const total = segmentedParagraphs.length;
  const initialIndex = useMemo(() => {
    if (typeof window === "undefined") return 0;
    const raw = new URLSearchParams(window.location.search).get("p");
    const n = raw ? Number(raw) : 0;
    if (!Number.isFinite(n)) return 0;
    return Math.min(Math.max(n, 0), Math.max(0, total - 1));
  }, [total]);

  const [index, setIndex] = useState<number>(initialIndex);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const x = useMotionValue(0);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    const currentP = current.get("p");
    const nextP = String(index);
    if (currentP === nextP) return;
    current.set("p", nextP);
    const url = `${pathname}?${current.toString()}`;
    window.history.replaceState(window.history.state, "", url);
  }, [index, pathname]);

  useEffect(() => {
    const onPop = () => {
      const raw = new URLSearchParams(window.location.search).get("p");
      const n = raw ? Number(raw) : 0;
      if (Number.isFinite(n)) {
        setIndex((prev) => {
          const clamped = Math.min(Math.max(n, 0), Math.max(0, total - 1));
          return clamped === prev ? prev : clamped;
        });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [total]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const apply = () => {
      const w = Math.round(el.getBoundingClientRect().width || 0);
      setViewportWidth((prev) =>
        Math.abs((prev || 0) - w) >= 2 ? w : prev || w
      );
    };
    apply();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => apply());
      ro.observe(el);
    } else {
      const onResize = () => apply();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    return () => ro && ro.disconnect();
  }, []);

  // Measure current slide height and keep viewport container snug to it
  useLayoutEffect(() => {
    const container = viewportRef.current;
    const currentSlide = slideRefs.current[index];
    if (!container || !currentSlide) return;
    const measure = () => {
      const h = Math.round(currentSlide.getBoundingClientRect().height || 0);
      setViewportHeight(h);
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(currentSlide);
    } else {
      const onResize = () => measure();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    return () => ro && ro.disconnect();
  }, [index, viewportWidth]);

  const go = (dir: -1 | 1) => {
    const target = Math.min(Math.max(index + dir, 0), Math.max(0, total - 1));
    if (viewportWidth > 0) {
      animate(x, -target * viewportWidth, {
        duration: prefersReducedMotion ? 0 : 0.25,
        ease: "easeOut",
      });
    }
    setIndex(target);
  };

  // When width changes, snap x instantly to current index (no animation)
  useEffect(() => {
    if (viewportWidth > 0) {
      x.set(-index * viewportWidth);
    }
  }, [viewportWidth, index, x]);

  return (
    <div
      className="sm:hidden"
      role="group"
      aria-roledescription="carousel"
      aria-label="Story paragraphs"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
        }
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div aria-live="polite" className="text-xs text-white/70">
          Paragraph {Math.min(index + 1, Math.max(1, total))} of {total}
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/30"}`}
            />
          ))}
        </div>
      </div>

      <motion.div
        ref={viewportRef}
        className="overflow-hidden touch-pan-y"
        style={{ visibility: viewportWidth > 0 ? "visible" : "hidden" }}
        initial={false}
        animate={{ height: viewportHeight > 0 ? viewportHeight : undefined }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.25,
          ease: "easeOut",
        }}
      >
        <motion.div
          className="flex items-start"
          drag="x"
          dragElastic={0.18}
          dragMomentum={false}
          dragConstraints={{
            left: -Math.max(0, (total - 1) * viewportWidth),
            right: 0,
          }}
          onDragEnd={(_, info) => {
            // Always snap to the closest page, with velocity bias for flicks
            const flick = 300; // px/s
            let target = index;
            if (Math.abs(info.velocity.x) > flick) {
              target = index + (info.velocity.x < 0 ? 1 : -1);
            } else if (viewportWidth > 0) {
              const deltaPages = info.offset.x / viewportWidth; // negative when dragging left
              target = Math.round(index - deltaPages);
            }
            if (target < 0) target = 0;
            if (target > total - 1) target = total - 1;
            if (viewportWidth > 0) {
              animate(x, -target * viewportWidth, {
                duration: prefersReducedMotion ? 0 : 0.25,
                ease: "easeOut",
              });
            }
            setIndex(target);
          }}
          initial={false}
          style={{ width: viewportWidth * Math.max(1, total), x }}
        >
          {segmentedParagraphs.map((segChunk, ci) => (
            <div
              key={ci}
              ref={(el) => {
                slideRefs.current[ci] = el;
              }}
              style={{ width: viewportWidth }}
              className="shrink-0 px-0"
            >
              <div className="space-y-2">
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
                    onClick={() =>
                      setChunkTransOn((s) => ({ ...s, [ci]: !s[ci] }))
                    }
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
                <div className="leading-10 font-extralight sm:font-normal text-white font-inter sm:text-[18px] text-xl">
                  <TokenRenderer
                    segments={segChunk as unknown as TRToken[]}
                    showPinyin={isChunkPinyinOn(ci)}
                    keyPrefix={`story-para${ci}`}
                    multiSelect={multiSelect}
                    selectedWords={
                      selectedWords as unknown as Record<string, TRSelectedWord>
                    }
                    toggleSelectWord={
                      toggleSelectWord as unknown as TokenRendererProps["toggleSelectWord"]
                    }
                    selectionIndexContext={{ paraIndex: ci }}
                    setPopup={
                      setPopup as unknown as TokenRendererProps["setPopup"]
                    }
                    openFromElement={openFromElement}
                    contentRef={contentRef}
                    applyHSKUnderline={true}
                    hskUnderlineClass={hskUnderlineClass}
                  />
                </div>
                <AnimatePresence initial={false}>
                  {isChunkTransOn(ci) && translationParagraphs[ci] && (
                    <motion.div
                      key={`chunk-translation-mobile-${ci}`}
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
            </div>
          ))}
        </motion.div>
      </motion.div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#222831]"
          aria-label="Previous paragraph"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === total - 1}
          className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] text-[#a6a6a6] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#222831]"
          aria-label="Next paragraph"
        >
          Next
        </button>
      </div>
    </div>
  );
}

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
  openFromElement,
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
  openFromElement?: TokenRendererProps["openFromElement"];
}) {
  return (
    <>
      {/* Mobile: swipeable pager */}
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
        openFromElement={openFromElement}
      />

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
              <TokenRenderer
                segments={segChunk as unknown as TRToken[]}
                showPinyin={isChunkPinyinOn(ci)}
                keyPrefix={`story-para${ci}`}
                multiSelect={multiSelect}
                selectedWords={
                  selectedWords as unknown as Record<string, TRSelectedWord>
                }
                toggleSelectWord={
                  toggleSelectWord as unknown as TokenRendererProps["toggleSelectWord"]
                }
                selectionIndexContext={{ paraIndex: ci }}
                setPopup={setPopup as unknown as TokenRendererProps["setPopup"]}
                openFromElement={openFromElement}
                contentRef={contentRef}
                applyHSKUnderline={true}
                hskUnderlineClass={hskUnderlineClass}
              />
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
