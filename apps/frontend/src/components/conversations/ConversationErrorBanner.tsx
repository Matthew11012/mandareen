"use client";

import React, { forwardRef } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversationErrorState =
  | {
      kind: "quota";
      message: string;
      resource: string;
      planCap: number;
      used: number;
    }
  | {
      kind: "rate";
      message: string;
      resource: string;
      retrySeconds: number;
      retryAt: number;
    }
  | {
      kind: "concurrency";
      message: string;
      resource: string;
      limit?: number;
      retrySeconds?: number;
      retryAt?: number;
    };

interface ConversationErrorBannerProps {
  error: ConversationErrorState;
  onDismiss?: () => void;
}

export const ConversationErrorBanner = forwardRef<
  HTMLDivElement,
  ConversationErrorBannerProps
>(function ConversationErrorBanner({ error, onDismiss }, ref) {
  const baseClass =
    "rounded-xl border px-4 py-3 flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1b1f26]";

  if (error.kind === "quota") {
    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className={cn(
          baseClass,
          "border-amber-500/30 bg-amber-500/10 text-amber-100"
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-300" />
          <div className="flex-1">
            <p className="text-sm font-semibold font-inter">
              {error.message}
            </p>
            <p className="text-xs text-amber-200/90 mt-1">
              You&apos;ve used {error.used.toLocaleString()} of{" "}
              {error.planCap.toLocaleString()} allowed this period. Upgrade your
              plan to send more messages right away.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#161921]"
          >
            View plans &amp; upgrade
          </Link>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-amber-200 hover:text-white hover:bg-amber-500/20 transition-colors"
            >
              <XCircle className="w-3 h-3" />
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  }

  if (error.kind === "rate") {
    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className={cn(
          baseClass,
          "border-blue-500/30 bg-blue-500/10 text-blue-100"
        )}
      >
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 mt-0.5 text-blue-300" />
          <div className="flex-1">
            <p className="text-sm font-semibold font-inter">
              Slow down just a bit—your plan limits how fast you can send
              messages.
            </p>
            <p className="text-xs text-blue-200/90 mt-1">
              {error.message}{" "}
              {error.retrySeconds > 0 ? (
                <>
                  Try again in{" "}
                  <span className="font-semibold">
                    {Math.max(0, error.retrySeconds)}
                  </span>{" "}
                  second{Math.max(0, error.retrySeconds) === 1 ? "" : "s"}.
                </>
              ) : (
                "You can send another message now."
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-live="polite"
      className={cn(
        baseClass,
        "border-purple-500/30 bg-purple-500/10 text-purple-100"
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5 text-purple-200" />
        <div className="flex-1">
          <p className="text-sm font-semibold font-inter">
            We can only keep one live AI conversation open per account right
            now.
          </p>
          <p className="text-xs text-purple-200/80 mt-1">
            {error.message} If you have another tab, window, or device with an
            active conversation, close it and then try again here.
            {typeof error.retrySeconds === "number" && error.retrySeconds > 0 ? (
              <>
                {" "}
                You can retry in approximately{" "}
                <span className="font-semibold">
                  {Math.max(0, error.retrySeconds)}
                </span>{" "}
                second{Math.max(0, error.retrySeconds) === 1 ? "" : "s"}.
              </>
            ) : null}
          </p>
        </div>
      </div>
      {onDismiss && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-purple-200 hover:text-white hover:bg-purple-500/20 transition-colors"
          >
            <XCircle className="w-3 h-3" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
});

