"use client";

import React, { useMemo, useState } from "react";
import type { UsageSummary } from "@/lib/api/usage";
import {
  transformResourceUsage,
  shouldDisplayResource,
} from "@/lib/constants/usage-resources";
import { UsageBanner } from "@/components/usage/usage-banner";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export const CONVERSATION_USAGE_RESOURCES = [
  "convo_message_text",
  "convo_message_audio",
  "convo_tts_seconds",
] as const;

interface ConversationUsageHeaderProps {
  summary?: UsageSummary;
  isLoading: boolean;
  className?: string;
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

  const forceExpanded = maxPct >= 90;
  const [userExpanded, setUserExpanded] = useState(false);
  const isExpanded = forceExpanded || userExpanded;

  const summaryLine = badges
    .map(
      (badge) =>
        `${badge.label}: ${numberFormatter.format(badge.used)}/${numberFormatter.format(badge.cap)}`
    )
    .join(" · ");

  if (isLoading && badges.length === 0) {
    return (
      <section
        aria-label="Conversation usage loading"
        className={cn(
          "rounded-xl border border-[#2e323a] bg-[#1b1f26] p-3 sm:p-4",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 flex-1 rounded-lg bg-[#2e323a] animate-pulse" />
          <div className="hidden sm:block h-9 w-9 rounded-full bg-[#2e323a] animate-pulse" />
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
      <div className="rounded-xl border border-[#2e323a] bg-[#1b1f26] p-3 sm:p-4">
        <button
          type="button"
          onClick={() => {
            if (forceExpanded) return;
            setUserExpanded((prev) => !prev);
          }}
          aria-expanded={isExpanded}
          aria-controls="conversation-usage-details"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1f26]",
            forceExpanded ? "cursor-default" : "cursor-pointer"
          )}
        >
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="conversation-usage-heading"
                className="text-sm font-inter font-semibold text-white"
              >
                Conversation usage
              </h2>
              {headerDescription && (
                <span className="text-xs font-inter text-[#a6a6a6]">
                  {headerDescription}
                </span>
              )}
            </div>
            {summaryLine && (
              <p className="mt-1 text-xs font-inter text-[#a6a6a6] line-clamp-2">
                {summaryLine}
              </p>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[#a6a6a6] transition-transform duration-200",
              isExpanded ? "rotate-180" : "rotate-0"
            )}
            aria-hidden="true"
          />
        </button>

        {isExpanded && (
          <div
            id="conversation-usage-details"
            className="mt-3 space-y-3"
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
                    <div
                      className="text-sm font-inter font-medium text-white tabular-nums"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {numberFormatter.format(badge.used)}{" "}
                      <span className="text-xs font-inter font-normal text-[#a6a6a6]">
                        of {numberFormatter.format(badge.cap)}
                      </span>
                    </div>
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
