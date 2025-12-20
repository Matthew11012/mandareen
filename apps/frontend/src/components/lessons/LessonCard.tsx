"use client";

import { motion } from "framer-motion";
import React from "react";
import { Check, ArrowRight } from "lucide-react";

type Props = {
  id: number;
  level: number;
  title?: string;
  titleTranslation?: string;
  createdAt: string | Date;
  isFinished: boolean;
  lessonType?: string;
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
    lessonType,
    getLevelPillColor,
    onClick,
  }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    const dateLabel = React.useMemo(() => {
      const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
    }, [createdAt]);

    const visualIcon = React.useMemo(() => {
      if (lessonType?.toLowerCase().includes("story")) return "📖";
      if (lessonType?.toLowerCase().includes("dialogue")) return "💬";
      return null;
    }, [lessonType]);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0, borderColor: "#404040" }}
        exit={{ opacity: 0, scale: 0.9, y: -12 }}
        transition={{ duration: 0.2, layout: { duration: 0.3 } }}
        className={`relative overflow-hidden rounded-xl p-5 cursor-pointer flex flex-col justify-between min-h-[160px] ${
          isFinished
            ? "border border-green-500/50 bg-gradient-to-br from-green-900/20 to-green-800/10 shadow-lg ring-1 ring-green-500/30"
            : "border border-[#404040] bg-[#2e323a] drop-shadow-xl"
        }`}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        whileHover={{
          scale: 1.02,
          borderColor: isFinished ? "#20c997" : "#4040f2",
          backgroundColor: isFinished ? undefined : "#343942",
          transition: { duration: 0.15, ease: "easeOut" },
        }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Visual Background Element */}
        <div className="absolute -right-2 bottom-1 opacity-[0.08] pointer-events-none select-none flex flex-col items-end">
          {visualIcon && (
            <span className="text-7xl leading-none mb-1">{visualIcon}</span>
          )}
        </div>

        <div className="relative z-10 flex flex-col gap-3">
          {/* Top Row */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(
                level
              )}`}
            >
              HSK {level}
            </span>
            {isFinished ? (
              <div className="bg-emerald-500/20 p-1 rounded-full border border-emerald-500/40">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full border border-[#404040] bg-[#1e2227]/50" />
            )}
          </div>

          {/* Middle Content */}
          <div className="space-y-1.5">
            <h3
              className="text-white font-inter font-bold text-base leading-snug line-clamp-2 min-h-[2.5rem]"
              title={(titleTranslation || title || `Lesson #${id}`) as string}
            >
              {titleTranslation || title || `Lesson #${id}`}
            </h3>
            {title && (
              <p
                className="text-gray-400 font-inter text-xs line-clamp-1"
                title={(title as string) || undefined}
              >
                {title}
              </p>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="relative z-10 flex items-center justify-between mt-4">
          <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
            {dateLabel}
          </span>

          <motion.div
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : 5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center gap-1 text-[#5c5cff] text-xs font-bold"
          >
            <span>{isFinished ? "Review" : "Study"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.div>
        </div>
      </motion.div>
    );
  }
);

LessonCard.displayName = "LessonCard";
