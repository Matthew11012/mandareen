"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for UsageBanner component.
 */
export interface UsageBannerProps {
  /**
   * Percentage of usage (0-100).
   */
  pct: number;

  /**
   * Optional className for the container.
   */
  className?: string;

  /**
   * Optional callback when upgrade CTA is clicked.
   */
  onUpgradeClick?: () => void;
}

/**
 * UsageBanner Component
 *
 * Features:
 * - Displays warning when usage ≥90%
 * - Displays danger when usage ≥100%
 * - Includes upgrade CTA linking to /pricing
 * - Uses aria-live="polite" for screen readers
 * - Does not steal focus (polite announcement)
 */
export function UsageBanner({
  pct,
  className,
  onUpgradeClick,
}: UsageBannerProps) {
  const isWarning = pct >= 90 && pct < 100;
  const isDanger = pct >= 100;

  // Don't render if usage is below warning threshold
  if (!isWarning && !isDanger) {
    return null;
  }

  const message = isDanger
    ? "You've reached your usage limit. Upgrade to continue using this feature."
    : "You're approaching your usage limit. Consider upgrading for more capacity.";

  const bgColor = isDanger
    ? "bg-red-500/10 border-red-500/20"
    : "bg-amber-500/10 border-amber-500/20";

  const textColor = isDanger
    ? "text-red-400"
    : "text-amber-400";

  const iconColor = isDanger
    ? "text-red-400"
    : "text-amber-400";

  return (
    <div
      className={cn(
        "rounded-xl p-4 border",
        bgColor,
        className
      )}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn("w-5 h-5 flex-shrink-0 mt-0.5", iconColor)}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-inter font-semibold mb-2", textColor)}>
            {message}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/pricing"
              onClick={onUpgradeClick}
              className="inline-flex items-center gap-2 text-sm font-inter font-medium text-white hover:text-white/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e323a] rounded-md px-3 py-1.5 bg-[#4040f2] hover:bg-[#3636d9] min-h-[44px]"
            >
              Upgrade plan
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

