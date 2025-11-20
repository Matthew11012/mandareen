"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { UsageSummary } from "@/lib/api/usage";
import {
  transformResourceUsage,
  shouldDisplayResource,
} from "@/lib/constants/usage-resources";
import { UsageBanner } from "@/components/usage/usage-banner";
import { cn } from "@/lib/utils";
import { ChevronDown, RefreshCw, Loader2 } from "lucide-react";

export const CONVERSATION_USAGE_RESOURCES = [
  "convo_tts_seconds",
  "convo_manual_notes",
] as const;

interface ConversationUsageHeaderProps {
  summary?: UsageSummary;
  isLoading: boolean;
  className?: string;
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
}

interface UsageBadgeData {
  resource: string;
  label: string;
  used: number;
  cap: number;
  pct: number;
  resetsAt: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatUsageValue(resource: string, value: number): string {
  if (resource === "convo_tts_seconds") {
    if (value === 0) return "0";
    if (value < 10) return value.toFixed(1);
    return value.toFixed(0);
  }
  return numberFormatter.format(value);
}

function getBadgeStyles(pct: number): string {
  if (pct >= 100) {
    return "border-red-500/40 bg-red-500/10";
  }
  if (pct >= 90) {
    return "border-amber-500/40 bg-amber-500/10";
  }
  return "border-[#2e323a] bg-[#1b1f26]";
}

export function ConversationUsageHeader({
  summary,
  isLoading,
  className,
  onRefresh,
  isRefreshing = false,
}: ConversationUsageHeaderProps) {
  const badges: UsageBadgeData[] = useMemo(() => {
    if (!summary) return [];

    return CONVERSATION_USAGE_RESOURCES.flatMap((resource) => {
      const usage = summary.resources[resource];
      if (!usage || !shouldDisplayResource(resource, usage.cap)) {
        return [];
      }

      const transformed = transformResourceUsage(
        resource,
        usage.used,
        usage.cap
      );

      return [
        {
          resource,
          label: transformed.label,
          used: transformed.used,
          cap: transformed.cap,
          pct: usage.pct,
          resetsAt: usage.resetsAt,
        },
      ];
    });
  }, [summary]);

  const maxPct = useMemo(() => {
    if (badges.length === 0) return 0;
    return Math.max(...badges.map((badge) => badge.pct));
  }, [badges]);

  const audioBadge = badges.find(
    (badge) => badge.resource === "convo_tts_seconds"
  );
  const shouldLockExpanded = !!audioBadge && audioBadge.pct >= 100;
  const shouldAutoExpand = maxPct >= 90;
  const [displayMode, setDisplayMode] = useState<"chip" | "expanded">("chip");
  const autoExpandAppliedRef = useRef(false);

  useEffect(() => {
    if (shouldAutoExpand && !autoExpandAppliedRef.current) {
      setDisplayMode("expanded");
      autoExpandAppliedRef.current = true;
    }
    if (!shouldAutoExpand) {
      autoExpandAppliedRef.current = false;
    }
  }, [shouldAutoExpand]);

  useEffect(() => {
    if (shouldLockExpanded) {
      setDisplayMode("expanded");
    }
  }, [shouldLockExpanded]);

  const isExpanded = displayMode === "expanded";

  const summaryLine = badges
    .map((badge) => {
      // For audio minutes, show percentage instead of X/Y format
      if (badge.resource === "convo_tts_seconds") {
        const displayPct = Math.min(Math.max(badge.pct, 0), 999);
        return `${badge.label}: ${displayPct.toFixed(0)}%`;
      }
      return `${badge.label}: ${numberFormatter.format(badge.used)}/${numberFormatter.format(badge.cap)}`;
    })
    .join(" · ");

  if (isLoading && badges.length === 0) {
    return (
      <section
        aria-label="Conversation usage loading"
        className={cn("min-h-[32px]", className)}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-[#2e323a] bg-[#1b1f26]/80 px-3 py-1.5">
          <div className="h-3 w-16 rounded-full bg-[#2e323a] animate-pulse" />
          <div className="hidden sm:block h-3 w-32 rounded-full bg-[#2e323a] animate-pulse" />
        </div>
      </section>
    );
  }

  if (!summary || badges.length === 0) {
    return null;
  }

  const earliestReset = badges
    .map((badge) => new Date(badge.resetsAt))
    .filter((date) => !Number.isNaN(date.valueOf()))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const headerDescription =
    earliestReset != null
      ? `Resets ${dateFormatter.format(earliestReset)}`
      : summary.windowDays
        ? `${summary.windowDays}-day window`
        : undefined;

  return (
    <section
      aria-labelledby="conversation-usage-heading"
      className={cn(className)}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
              if (shouldLockExpanded) return;
            setDisplayMode((mode) => (mode === "chip" ? "expanded" : "chip"));
          }}
          aria-expanded={isExpanded}
          aria-controls="conversation-usage-details"
            aria-disabled={shouldLockExpanded}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-[#2e323a] bg-[#1b1f26]/80 px-3 py-1.5 text-xs font-inter text-[#d1d5db] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] cursor-pointer",
              shouldLockExpanded
              ? "cursor-not-allowed border-amber-500/40 bg-amber-500/10 text-amber-200"
              : "hover:border-[#3c4250] hover:bg-[#1f242c]"
          )}
        >
          <span className="font-semibold text-white">Usage</span>
          {headerDescription && (
              <span className="text-xs text-[#a6a6a6]">
                {headerDescription}
              </span>
          )}
          {summaryLine && (
            <span className="hidden sm:inline text-xs text-[#8f9bb3]">
              {summaryLine}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-[#a6a6a6] transition-transform duration-200",
              isExpanded ? "rotate-180" : "rotate-0"
            )}
            aria-hidden="true"
          />
        </button>

          {onRefresh && (
            <button
              type="button"
              onClick={() => {
                if (isRefreshing) return;
                void onRefresh();
              }}
              aria-label="Refresh usage"
              title="Refresh usage"
              disabled={isRefreshing}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#2e323a] bg-[#1b1f26]/80 text-[#d1d5db] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] cursor-pointer",
                isRefreshing
                  ? "cursor-not-allowed opacity-70"
                  : "hover:border-[#3c4250] hover:bg-[#1f242c]"
              )}
            >
              {isRefreshing ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        {isExpanded && (
          <div
            id="conversation-usage-details"
            className="space-y-3 rounded-xl border border-[#2e323a] bg-[#1b1f26] p-3 sm:p-4"
            aria-live="polite"
          >
            {maxPct >= 90 && (
              <UsageBanner
                pct={maxPct}
                className="border-none bg-[#242a33]"
                onUpgradeClick={() => {
                  // Analytics hook placeholder.
                }}
              />
            )}

            <div className="flex flex-wrap gap-3 overflow-x-auto pb-1 sm:overflow-visible">
              {badges.map((badge) => {
                const resetsDate = new Date(badge.resetsAt);
                const resetsText = Number.isNaN(resetsDate.valueOf())
                  ? null
                  : `Resets ${dateFormatter.format(resetsDate)}`;

                const displayPct = Math.min(Math.max(badge.pct, 0), 999);
                const ariaLabel = `${badge.label}: ${numberFormatter.format(
                  badge.used
                )} of ${numberFormatter.format(
                  badge.cap
                )} used. ${displayPct.toFixed(
                  1
                )}% of limit${resetsText ? `. ${resetsText}.` : "."}`;

                const isAudioMinutes = badge.resource === "convo_tts_seconds";
                const progressPct = Math.min(Math.max(badge.pct, 0), 100);

                return (
                  <div
                    key={badge.resource}
                    className={cn(
                      "min-h-[44px] min-w-[180px] flex-1 rounded-xl border px-3 py-2",
                      "flex flex-col justify-between gap-1 transition-colors duration-200",
                      getBadgeStyles(badge.pct)
                    )}
                    role="group"
                    aria-label={ariaLabel}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-inter font-semibold uppercase tracking-wide text-white/80">
                        {badge.label}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-inter font-semibold tabular-nums",
                          badge.pct >= 100
                            ? "text-red-400"
                            : badge.pct >= 90
                              ? "text-amber-300"
                              : "text-[#a6a6a6]"
                        )}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {displayPct.toFixed(0)}%
                      </span>
                    </div>
                    {isAudioMinutes ? (
                      <>
                        <div className="w-full h-2 bg-[#2e323a] rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-300 ease-out",
                              badge.pct >= 100
                                ? "bg-red-500"
                                : badge.pct >= 90
                                  ? "bg-amber-500"
                                  : "bg-[#4040f2]"
                            )}
                            style={{ width: `${progressPct}%` }}
                            role="progressbar"
                            aria-valuenow={badge.pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${badge.label} usage: ${displayPct.toFixed(1)}%`}
                          />
                        </div>
                        <div
                          className="text-sm font-inter font-medium text-white tabular-nums"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatUsageValue(badge.resource, badge.used)}{" "}
                          <span className="text-xs font-inter font-normal text-[#a6a6a6]">
                            of {formatUsageValue(badge.resource, badge.cap)}
                          </span>
                        </div>
                      </>
                    ) : (
                    <div
                      className="text-sm font-inter font-medium text-white tabular-nums"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                        {formatUsageValue(badge.resource, badge.used)}{" "}
                      <span className="text-xs font-inter font-normal text-[#a6a6a6]">
                          of {formatUsageValue(badge.resource, badge.cap)}
                      </span>
                    </div>
                    )}
                    {resetsText && (
                      <span className="text-xs font-inter text-[#a6a6a6]">
                        {resetsText}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
