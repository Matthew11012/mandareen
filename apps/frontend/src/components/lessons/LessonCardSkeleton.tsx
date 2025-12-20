"use client";

import React from "react";

export const LessonCardSkeleton: React.FC = React.memo(() => {
  return (
    <div className="rounded-xl p-5 border border-[#404040] bg-[#2e323a] min-h-[160px] flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {/* HSK Level Pill Skeleton */}
          <div className="h-5 w-16 bg-[#3a3f48] rounded-full motion-safe:animate-pulse" />
          {/* Status Circle Skeleton */}
          <div className="h-5 w-5 bg-[#3a3f48] rounded-full motion-safe:animate-pulse" />
        </div>
        
        <div className="space-y-2">
          {/* Title Skeletons */}
          <div className="h-4 w-full bg-[#3a3f48] rounded motion-safe:animate-pulse" />
          <div className="h-4 w-2/3 bg-[#3a3f48] rounded motion-safe:animate-pulse" />
          {/* Subtitle Skeleton */}
          <div className="h-3 w-1/2 bg-[#3a3f48] rounded motion-safe:animate-pulse mt-3" />
        </div>
      </div>
      
      {/* Footer Skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 bg-[#3a3f48] rounded motion-safe:animate-pulse" />
        <div className="h-4 w-12 bg-[#3a3f48] rounded motion-safe:animate-pulse" />
      </div>
    </div>
  );
});

LessonCardSkeleton.displayName = "LessonCardSkeleton";

