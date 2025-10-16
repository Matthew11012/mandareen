"use client";

import { Clock, Play } from "lucide-react";
import Link from "next/link";
import type {
  ServerCurriculumLesson,
  ServerCurriculumUnit,
} from "@/lib/server/api";

interface GuidedPathProps {
  guidedUnit: ServerCurriculumUnit;
  guidedLesson: ServerCurriculumLesson | null;
  curriculumProgress: {
    completed: number;
    total: number;
    percent: number;
  } | null;
}

export default function GuidedPath({
  guidedUnit,
  guidedLesson,
  curriculumProgress,
}: GuidedPathProps) {
  if (!guidedUnit || !guidedLesson || !curriculumProgress) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-[#16181d] p-4">
        <h4 className="text-sm font-inter text-amber-300">Next up</h4>
        <p className="text-white text-xl font-inter font-semibold mt-1">
          {guidedUnit.title}
        </p>
        {guidedLesson.description &&
          guidedLesson.description !== guidedLesson.title && (
            <p className="text-sm text-white/70 font-inter mt-2 line-clamp-3">
              {guidedLesson.description}
            </p>
          )}
        <div className="flex items-center gap-2 mt-2 text-xs text-amber-300/80">
          <Clock className="w-3.5 h-3.5" />
          <span>~15 min to complete</span>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-[#16181d] p-4">
        <h4 className="text-sm font-inter text-green-300">Progress</h4>
        <div
          className="mt-3 relative h-3 rounded-full bg-white/10 overflow-hidden"
          aria-label={`Curriculum progress: ${curriculumProgress.percent}% complete`}
        >
          <div
            className="h-full bg-gradient-to-r from-[#20c997] to-[#38ef7d] transition-all duration-500"
            style={{ width: `${curriculumProgress.percent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-white/60 font-inter">
          <span>
            {curriculumProgress.completed} / {curriculumProgress.total} lessons
          </span>
          <span>{curriculumProgress.percent}%</span>
        </div>
        <Link
          href={`/curriculum/${guidedUnit.id}/${guidedLesson.id}`}
          className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 bg-green-500/20 border border-green-500/50 text-green-200 text-sm font-semibold hover:bg-green-500/30 hover:border-green-500/70 transition-colors duration-200"
        >
          <Play className="w-4 h-4" />
          Resume lesson
        </Link>
      </div>
    </div>
  );
}
