"use client";

import { forwardRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationUsageToastProps {
  pct: number;
  resetsAt: string;
  onDismiss?: () => void;
  className?: string;
}

function formatPct(pct: number): string {
  return pct >= 100 ? "100%" : `${pct.toFixed(0)}%`;
}

function formatResetDate(resetsAt: string): string | null {
  const date = new Date(resetsAt);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const ConversationUsageToast = forwardRef<
  HTMLDivElement,
  ConversationUsageToastProps
>(function ConversationUsageToast(
  { pct, resetsAt, onDismiss, className },
  ref
) {
  const resetDate = formatResetDate(resetsAt);
  const message =
    pct >= 100
      ? "You’ve reached this plan’s conversation limit."
      : "You’re nearing this plan’s conversation limit.";

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm",
        pct >= 100
          ? "border-red-400/60 bg-red-500/80 text-white"
          : "border-amber-400/60 bg-amber-600/85 text-white",
        className
      )}
    >
      <span className="mt-0.5 flex-shrink-0">
        <AlertTriangle
          className={cn(
            "h-5 w-5",
            pct >= 100 ? "text-red-200" : "text-amber-200"
          )}
          aria-hidden="true"
        />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-inter font-semibold">{message}</p>
        <p className="mt-1 text-xs font-inter text-white/90">
          {formatPct(pct)} of this period’s allowance used
          {resetDate ? `. Resets ${resetDate}.` : "."}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/30 text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-transparent cursor-pointer"
          aria-label="Dismiss usage warning"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
