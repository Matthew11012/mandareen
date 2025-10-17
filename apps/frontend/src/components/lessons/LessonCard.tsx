"use client";

import { motion } from "framer-motion";
import React from "react";
import { Check } from "lucide-react";

type Props = {
  id: number;
  level: number;
  title?: string;
  titleTranslation?: string;
  createdAt: string | Date;
  isFinished: boolean;
  typeLabel: string;
  getLevelPillColor: (level: number) => string;
  onClick: () => void;
};

export const LessonCard: React.FC<Props> = React.memo(
  ({
    id,
    level,
    title,
    titleTranslation,
    createdAt,
    isFinished,
    typeLabel,
    getLevelPillColor,
    onClick,
  }) => {
    const dateLabel = React.useMemo(() => {
      const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
      return d.toISOString().slice(0, 10);
    }, [createdAt]);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0, borderColor: "#404040" }}
        exit={{ opacity: 0, scale: 0.9, y: -12 }}
        transition={{ duration: 0.25, layout: { duration: 0.3 } }}
        className={`rounded-xl p-4 cursor-pointer ${
          isFinished
            ? "border border-green-500/50 bg-gradient-to-br from-green-900/20 to-green-800/10 shadow-lg ring-1 ring-green-500/30"
            : "border border-[#404040] bg-[#2e323a]"
        }`}
        onClick={onClick}
        whileHover={{
          scale: 1.02,
          borderColor: isFinished ? "#20c997" : "#4040f2",
        }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(
                level
              )}`}
            >
              HSK {level}
            </span>
            {isFinished ? (
              <span className="inline-flex items-center gap-1 text-emerald-500 text-[11px] font-inter bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <Check className="w-3 h-3 text-green-400 mx-auto" />
                Finished
              </span>
            ) : (
              <span />
            )}
          </div>
          <p
            className="text-white font-inter font-semibold mt-2 truncate text-sm"
            title={(titleTranslation || title || `Lesson #${id}`) as string}
          >
            {titleTranslation || title || `Lesson #${id}`}
          </p>
          {title && (
            <p
              className="text-[#a6a6a6] font-inter text-xs truncate line-clamp-1 mt-1"
              title={(title as string) || undefined}
            >
              {title}
            </p>
          )}
          <div className="mt-2 pt-2 border-t border-[#404040] flex items-center justify-between text-[11px] text-[#8b949e]">
            <span>{dateLabel}</span>
            <span className="text-[#a6a6a6]">{typeLabel}</span>
          </div>
        </div>
      </motion.div>
    );
  }
);

LessonCard.displayName = "LessonCard";
