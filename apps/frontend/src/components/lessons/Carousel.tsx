"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

type CarouselProps<T> = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  pages: (T | null)[][];
  pageSize: number;
  padKeyPrefix: string;
  renderItem: (item: T | null, idx: number) => React.ReactNode;
};

export function Carousel<T>({
  containerRef,
  onScroll,
  pages,
  pageSize,
  padKeyPrefix,
  renderItem,
}: CarouselProps<T>) {
  const hasPagination = pages.length > 1;

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="flex gap-6 snap-x snap-mandatory overflow-x-auto pb-2 px-4 scrollbar-hide"
    >
      <AnimatePresence mode="popLayout">
        {pages.map((page, i) => {
          const spacer = page.length >= pageSize;
          const padCount = Math.max(0, pageSize - page.length);
          const padded = [...page, ...Array(padCount).fill(null)];
          return (
            <motion.div
              key={i}
              layout
              className="min-w-full snap-start flex items-stretch"
            >
              {/* Spacer only when there is pagination AND this is the first page */}
              {hasPagination && i === 0 && (
                <div
                  className={`${spacer ? "flex-none w-3 sm:w-4 md:w-5" : "flex-none w-0"}`}
                  aria-hidden="true"
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 flex-1 min-w-0">
                <AnimatePresence mode="popLayout">
                  {padded.map((item, idx) =>
                    item ? (
                      // assume renderItem returns an element with its own key (preferred)
                      renderItem(item, idx)
                    ) : (
                      <div
                        key={`${padKeyPrefix}-${i}-${idx}`}
                        className="invisible bg-[#2e323a] rounded-xl p-4 border border-[#404040]"
                      />
                    )
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
