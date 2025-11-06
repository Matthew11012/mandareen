"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { lessonsApi } from "@/lib/api/lessons";

export function useLessonData(lessonId: number | null | undefined) {
  return useQuery({
    queryKey: ["lesson", lessonId],
    enabled:
      typeof lessonId === "number" && Number.isFinite(lessonId) && lessonId > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!lessonId || !Number.isFinite(lessonId))
        throw new Error("Invalid lesson id");
      return lessonsApi.getById(lessonId);
    },
    select: (data) => data, // keep shape stable for now
    meta: { source: "useLessonData" },
  });
}