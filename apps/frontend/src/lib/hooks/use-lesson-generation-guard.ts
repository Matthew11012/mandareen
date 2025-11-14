"use client";

import { useMemo } from "react";
import { useUsageSummary } from "./use-usage";
import { useLessonsGenerationStore } from "@/lib/stores/lessons-generation-store";

const LESSON_CUSTOM_GENERATED_RESOURCE = "lesson_custom_generated";

/**
 * Hook to guard lesson generation based on usage limits and generation state.
 *
 * Features:
 * - Checks usage summary for `lesson_custom_generated` resource
 * - Checks if a generation is already in progress (persisted state)
 * - Returns `canGenerate`, `disabledReason`, and usage data
 * - Handles loading and error states gracefully
 *
 * @param enabled Whether to enable the usage query (defaults to true)
 * @returns Guard state for lesson generation
 */
export function useLessonGenerationGuard(enabled: boolean = true) {
  const { data: usageSummary, isLoading: usageLoading } = useUsageSummary(enabled);
  const genStore = useLessonsGenerationStore();

  const isInProgress = genStore.inProgress;
  const isAttached = genStore.attached;

  const guardState = useMemo(() => {
    // If usage data is loading, be conservative: disable generation
    if (usageLoading) {
      return {
        canGenerate: false,
        disabledReason: "Checking usage limits...",
        usageData: null,
        isInProgress: false,
        isLoading: true,
      } as const;
    }

    // If generation is in progress, disable
    if (isInProgress || isAttached) {
      return {
        canGenerate: false,
        disabledReason: "A lesson is currently being generated. Please wait for it to complete.",
        usageData: null,
        isInProgress: true,
        isLoading: false,
      } as const;
    }

    // If no usage summary, allow (fallback for edge cases)
    if (!usageSummary) {
      return {
        canGenerate: true,
        disabledReason: null,
        usageData: null,
        isInProgress: false,
        isLoading: false,
      } as const;
    }

    // Check usage for lesson_custom_generated resource
    const usage = usageSummary.resources[LESSON_CUSTOM_GENERATED_RESOURCE];
    if (!usage) {
      // Resource not found in summary (might be unlimited or not applicable)
      return {
        canGenerate: true,
        disabledReason: null,
        usageData: null,
        isInProgress: false,
        isLoading: false,
      } as const;
    }

    // Check if usage is at or exceeds limit
    const isAtLimit = usage.pct >= 100;
    const isNearLimit = usage.pct >= 90;

    if (isAtLimit) {
      return {
        canGenerate: false,
        disabledReason: `You've reached your limit of ${usage.cap.toLocaleString()} custom lessons this period. Upgrade your plan to generate more lessons.`,
        usageData: {
          used: usage.used,
          cap: usage.cap,
          pct: usage.pct,
          resetsAt: usage.resetsAt,
        },
        isInProgress: false,
        isLoading: false,
      } as const;
    }

    // Usage is within limit
    return {
      canGenerate: true,
      disabledReason: isNearLimit
        ? `You're near your limit (${usage.used.toLocaleString()}/${usage.cap.toLocaleString()}). Consider upgrading for more capacity.`
        : null,
      usageData: {
        used: usage.used,
        cap: usage.cap,
        pct: usage.pct,
        resetsAt: usage.resetsAt,
      },
      isInProgress: false,
      isLoading: false,
    } as const;
  }, [usageSummary, usageLoading, isInProgress, isAttached]);

  return guardState;
}

