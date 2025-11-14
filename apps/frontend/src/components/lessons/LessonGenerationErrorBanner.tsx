"use client";

import React, { forwardRef } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type LessonGenerationErrorState =
  | {
      type: "quota_exceeded";
      message: string;
      resource?: string;
      planCap?: number;
      used?: number;
    }
  | {
      type: "rate_limited";
      message: string;
      resource?: string;
      retryAfter?: number;
    }
  | {
      type: "concurrency_limit";
      message: string;
      resource?: string;
      limit?: number;
      retryAfter?: number;
    }
  | {
      type: "generic";
      message: string;
    };

interface LessonGenerationErrorBannerProps {
  error: LessonGenerationErrorState | null;
  onDismiss?: () => void;
  className?: string;
}

export const LessonGenerationErrorBanner = forwardRef<
  HTMLDivElement,
  LessonGenerationErrorBannerProps
>(function LessonGenerationErrorBanner({ error, onDismiss, className }, ref) {
  if (!error) return null;

  const baseClass =
    "rounded-xl border px-4 py-3 flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1b1f26]";

  if (error.type === "quota_exceeded") {
    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className={cn(
          baseClass,
          "border-amber-500/30 bg-amber-500/10 text-amber-100",
          className
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-300 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold font-inter">{error.message}</p>
            {error.used !== undefined && error.planCap !== undefined && (
              <p className="text-xs text-amber-200/90 mt-1">
                You&apos;ve used {error.used.toLocaleString()} of{" "}
                {error.planCap.toLocaleString()} custom lessons allowed this
                period. Upgrade your plan to generate more lessons.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#161921] min-h-[44px]"
          >
            View plans &amp; upgrade
          </Link>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-amber-200 hover:text-white hover:bg-amber-500/20 transition-colors min-h-[44px] cursor-pointer"
              aria-label="Dismiss error"
            >
              <XCircle className="w-3 h-3" aria-hidden="true" />
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  }

  if (error.type === "rate_limited") {
    const retrySeconds =
      error.retryAfter !== undefined
        ? Math.max(0, Math.ceil((error.retryAfter - Date.now()) / 1000))
        : 0;

    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className={cn(
          baseClass,
          "border-blue-500/30 bg-blue-500/10 text-blue-100",
          className
        )}
      >
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 mt-0.5 text-blue-300 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold font-inter">{error.message}</p>
            <p className="text-xs text-blue-200/90 mt-1">
              {retrySeconds > 0 ? (
                <>
                  Please wait{" "}
                  <span className="font-semibold">{retrySeconds}</span> second
                  {retrySeconds === 1 ? "" : "s"} before generating another
                  lesson.
                </>
              ) : (
                "You can generate another lesson now."
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error.type === "concurrency_limit") {
    const retrySeconds =
      error.retryAfter !== undefined
        ? Math.max(0, Math.ceil((error.retryAfter - Date.now()) / 1000))
        : undefined;

    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className={cn(
          baseClass,
          "border-purple-500/30 bg-purple-500/10 text-purple-100",
          className
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-purple-200 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold font-inter">{error.message}</p>
            <p className="text-xs text-purple-200/80 mt-1">
              Only one lesson can be generated at a time. Please wait for the
              current generation to complete.
              {retrySeconds !== undefined && retrySeconds > 0 && (
                <>
                  {" "}
                  You can retry in approximately{" "}
                  <span className="font-semibold">{retrySeconds}</span> second
                  {retrySeconds === 1 ? "" : "s"}.
                </>
              )}
            </p>
          </div>
        </div>
        {onDismiss && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-purple-200 hover:text-white hover:bg-purple-500/20 transition-colors min-h-[44px] cursor-pointer"
              aria-label="Dismiss error"
            >
              <XCircle className="w-3 h-3" aria-hidden="true" />
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }

  // Generic error
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-live="polite"
      className={cn(
        baseClass,
        "border-red-500/30 bg-red-500/10 text-red-100",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5 text-red-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold font-inter">{error.message}</p>
        </div>
      </div>
      {onDismiss && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-200 hover:text-white hover:bg-red-500/20 transition-colors min-h-[44px] cursor-pointer"
            aria-label="Dismiss error"
          >
            <XCircle className="w-3 h-3" aria-hidden="true" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
});
