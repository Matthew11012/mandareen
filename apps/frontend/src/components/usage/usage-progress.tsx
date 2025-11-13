"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Props for UsageProgress component.
 */
export interface UsageProgressProps {
  /**
   * Human-readable label for the resource (e.g., "Conversation messages").
   */
  label: string;

  /**
   * Amount used in the current period.
   */
  used: number;

  /**
   * Cap/limit for this resource.
   */
  cap: number;

  /**
   * Percentage used (0-100).
   */
  pct: number;

  /**
   * ISO 8601 timestamp when usage resets.
   */
  resetsAt: string;

  /**
   * Optional resource identifier for ARIA labels.
   */
  resource?: string;

  /**
   * Optional className for the container.
   */
  className?: string;
}

/**
 * UsageProgress Component
 *
 * Features:
 * - Accessible progressbar with ARIA attributes
 * - Color variants: default (0-89%), warning (90-99%), danger (100%)
 * - Textual summary alongside bar (e.g., "12 of 60 messages used")
 * - Reset date display
 * - Tabular numbers for usage counts
 */
export function UsageProgress({
  label,
  used,
  cap,
  pct,
  resetsAt,
  resource,
  className,
}: UsageProgressProps) {
  // Determine color variant based on percentage
  const isWarning = pct >= 90 && pct < 100;
  const isDanger = pct >= 100;

  // Format reset date
  const formatResetDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        return "Resets today";
      } else if (diffDays === 1) {
        return "Resets tomorrow";
      } else if (diffDays <= 7) {
        return `Resets in ${diffDays} days`;
      } else {
        // Format as "Resets on Mon, Jan 15"
        return date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      }
    } catch {
      return "Resets soon";
    }
  };

  const resetDateText = formatResetDate(resetsAt);

  // Format usage count with locale-aware number formatting
  const formatCount = (count: number): string => {
    return count.toLocaleString("en-US");
  };

  // Get color classes for progress bar
  const getProgressBarColor = (): string => {
    if (isDanger) return "bg-red-500";
    if (isWarning) return "bg-amber-500";
    return "bg-blue-500";
  };

  // Get status icon
  const getStatusIcon = () => {
    if (isDanger) {
      return (
        <AlertTriangle
          className="w-4 h-4 text-red-400 flex-shrink-0"
          aria-hidden="true"
        />
      );
    }
    if (isWarning) {
      return (
        <AlertTriangle
          className="w-4 h-4 text-amber-400 flex-shrink-0"
          aria-hidden="true"
        />
      );
    }
    return (
      <CheckCircle2
        className="w-4 h-4 text-blue-400 flex-shrink-0"
        aria-hidden="true"
      />
    );
  };

  // Get status text
  const getStatusText = (): string => {
    if (isDanger) return "Limit reached";
    if (isWarning) return "Near limit";
    return "Within limit";
  };

  // Ensure percentage is clamped to 0-100 for display
  const displayPct = Math.min(Math.max(pct, 0), 100);

  // ARIA label for screen readers
  const ariaLabel = `${formatCount(used)} of ${formatCount(cap)} ${label} used. ${displayPct.toFixed(1)}% of limit. ${resetDateText}.`;

  return (
    <div
      className={cn(
        "bg-[#2e323a] rounded-xl p-4 border border-[#404040]",
        className
      )}
    >
      <div className="space-y-3">
        {/* Header: Label and Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-inter font-semibold text-white mb-1">
              {label}
            </h3>
            <div className="flex items-center gap-2 text-xs text-[#a6a6a6] font-inter">
              {getStatusIcon()}
              <span>{getStatusText()}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-lg font-inter font-semibold text-white tabular-nums">
              {formatCount(used)}
            </div>
            <div className="text-xs text-[#a6a6a6] font-inter">
              of {formatCount(cap)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-[#a6a6a6] font-inter">
            <span>Progress</span>
            <span className="tabular-nums">{displayPct.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-[#404040] rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-500",
                getProgressBarColor()
              )}
              style={{ width: `${displayPct}%` }}
              role="progressbar"
              aria-valuenow={used}
              aria-valuemin={0}
              aria-valuemax={cap}
              aria-label={ariaLabel}
              aria-describedby={
                resource ? `usage-${resource}-description` : undefined
              }
            />
          </div>
        </div>

        {/* Reset Date */}
        <div className="text-xs text-[#a6a6a6] font-inter">{resetDateText}</div>

        {/* Hidden description for screen readers */}
        {resource && (
          <div id={`usage-${resource}-description`} className="sr-only">
            {ariaLabel}
          </div>
        )}
      </div>
    </div>
  );
}
