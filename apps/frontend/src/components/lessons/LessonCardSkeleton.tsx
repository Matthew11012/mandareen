"use client";

import React from "react";

export const LessonCardSkeleton: React.FC = React.memo(() => {
  return (
    <div className="rounded-xl p-4 border border-[#404040] bg-[#2e323a]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          {/* HSK Level Pill Skeleton */}
          <div className="h-5 w-16 bg-[#404040] rounded-full motion-safe:animate-pulse" />
          {/* Finished Badge Placeholder */}
          <div className="h-5 w-0" />
        </div>
        {/* Title Skeleton */}
        <div className="h-4 w-full bg-[#404040] rounded motion-safe:animate-pulse mt-2" />
        {/* Subtitle Skeleton */}
        <div className="h-3 w-3/4 bg-[#404040] rounded motion-safe:animate-pulse mt-2" />
        {/* Footer Skeleton */}
        <div className="mt-2 pt-2 border-t border-[#404040] flex items-center justify-between">
          <div className="h-3 w-20 bg-[#404040] rounded motion-safe:animate-pulse" />
          <div className="h-3 w-16 bg-[#404040] rounded motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
});

LessonCardSkeleton.displayName = "LessonCardSkeleton";

