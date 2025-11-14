import React from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, XCircle } from "lucide-react";

export type AssessmentQuotaError = {
  type: "quota_exceeded" | "rate_limited" | "generic";
  message: string;
  resource?: string;
  planCap?: number;
  used?: number;
  retryAfter?: number;
};

export interface AssessmentQuotaBannerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  error: AssessmentQuotaError | null;
  starting: boolean;
  isQuotaExceeded: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

export const AssessmentQuotaBanner = React.forwardRef<
  HTMLDivElement,
  AssessmentQuotaBannerProps
>(function AssessmentQuotaBannerInner(
  { error, starting, isQuotaExceeded, onRetry, onDismiss, ...rest },
  ref
) {
  if (!error) return null;

  const showUsageDetails =
    error.type === "quota_exceeded" &&
    typeof error.planCap === "number" &&
    typeof error.used === "number";

  // Don't show dismiss button when quota is actually exceeded
  // Only show it for rate limit or other temporary errors
  const showDismissButton = !isQuotaExceeded && error.type !== "quota_exceeded";

  return (
    <div
      ref={ref}
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-inter"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      tabIndex={-1}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="w-5 h-5 text-amber-400 flex-shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-amber-200 font-semibold mb-2">{error.message}</p>
          {error.type === "quota_exceeded" && (
            <div className="space-y-2">
              {showUsageDetails && (
                <p className="text-amber-200/80 text-xs">
                  Used: {error.used} / {error.planCap}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 text-xs font-medium text-amber-200 hover:text-amber-100 underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16181d] rounded-md py-1 min-h-[44px] sm:min-h-0"
                >
                  Upgrade plan
                </Link>
                <button
                  onClick={onRetry}
                  disabled={starting || isQuotaExceeded}
                  className="inline-flex items-end gap-2 text-xs font-medium text-amber-200 hover:text-amber-100 underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16181d] rounded-md px-2 py-1 min-h-[44px] sm:min-h-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Try again
                  <RefreshCw
                    className={`w-3 h-3 ${starting ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          )}
          {error.type === "rate_limited" && (
            <div className="flex items-center gap-2">
              <button
                onClick={onRetry}
                disabled={starting}
                className="inline-flex items-end gap-2 text-xs font-medium text-amber-200 hover:text-amber-100 underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16181d] rounded-md px-2 py-1 min-h-[44px] sm:min-h-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Retry
                <RefreshCw
                  className={`w-3 h-3 ${starting ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>
        {showDismissButton && (
          <button
            onClick={onDismiss}
            className="text-amber-200/60 hover:text-amber-200 transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16181d] min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Dismiss error"
          >
            <XCircle className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
});

