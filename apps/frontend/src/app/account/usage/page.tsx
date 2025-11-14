"use client";

import React, { useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { useUsageSummary } from "@/lib/hooks/use-usage";
import { UsageProgress } from "@/components/usage/usage-progress";
import { UsageBanner } from "@/components/usage/usage-banner";
import {
  shouldDisplayResource,
  transformResourceUsage,
  RESOURCE_ORDER,
} from "@/lib/constants/usage-resources";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, Calendar, TrendingUp } from "lucide-react";
import Link from "next/link";
import { trackPageView } from "@/lib/analytics/analytics";
import type { ResourceUsage } from "@/lib/api/usage";

/**
 * Skeleton loader for usage page.
 */
function UsagePageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Summary Panel Skeleton */}
      <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] animate-pulse">
        <div className="h-6 w-32 bg-gray-700 rounded mb-4" />
        <div className="h-4 w-48 bg-gray-700 rounded" />
      </div>

      {/* Progress Bars Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-[#2e323a] rounded-xl p-4 border border-[#404040] animate-pulse"
          >
            <div className="h-4 w-32 bg-gray-700 rounded mb-3" />
            <div className="h-2 w-full bg-gray-700 rounded mb-2" />
            <div className="h-3 w-24 bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Usage Page Component
 *
 * Features:
 * - Displays usage summary for all resources
 * - Shows progress bars for each resource
 * - Displays high usage banners (≥90%)
 * - Provides upgrade CTA for high usage
 * - Shows reset dates for each resource
 * - Accessible with proper ARIA attributes
 * - Responsive layout (1 column mobile, 2 columns desktop)
 */
export default function UsagePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const {
    data: usageSummary,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useUsageSummary();

  // Track page view on mount
  useEffect(() => {
    trackPageView("usage", {
      plan: usageSummary?.plan.code || "unknown",
    });
  }, [usageSummary?.plan.code]);

  // Check if any resource is at high usage (≥90%)
  // Show banner when any individual resource is at warning or danger level
  // Must be called before conditional returns (Rules of Hooks)
  const hasHighUsage = useMemo(() => {
    if (!usageSummary) return false;

    const resources = Object.values(usageSummary.resources);
    return resources.some((usage) => usage.pct >= 90);
  }, [usageSummary]);

  // Get the highest usage percentage for banner display
  // Must be called before conditional returns (Rules of Hooks)
  const maxUsagePct = useMemo(() => {
    if (!usageSummary) return 0;

    const resources = Object.values(usageSummary.resources);
    if (resources.length === 0) return 0;

    return Math.max(...resources.map((usage) => usage.pct));
  }, [usageSummary]);

  // Get resources sorted by display order
  // Must be called before conditional returns (Rules of Hooks)
  const sortedResources = useMemo(() => {
    if (!usageSummary) return [];

    const resources = Object.entries(usageSummary.resources);
    const sorted: Array<[string, ResourceUsage]> = [];

    // Add resources in display order
    for (const resourceName of RESOURCE_ORDER) {
      const resource = resources.find(([name]) => name === resourceName);
      if (resource && shouldDisplayResource(resourceName, resource[1].cap)) {
        sorted.push(resource);
      }
    }

    // Add any remaining resources not in the order list
    for (const resource of resources) {
      if (!sorted.find(([name]) => name === resource[0])) {
        if (shouldDisplayResource(resource[0], resource[1].cap)) {
          sorted.push(resource);
        }
      }
    }

    return sorted;
  }, [usageSummary?.resources]);

  // Format window days text
  const getWindowDaysText = (windowDays: number): string => {
    if (windowDays === 30) {
      return "30-day rolling window";
    } else if (windowDays === 1) {
      return "Daily";
    } else {
      return `${windowDays}-day rolling window`;
    }
  };

  // Format reset date for summary panel
  const getNextResetDate = (): string | null => {
    if (!usageSummary) return null;

    const resources = Object.values(usageSummary.resources);
    if (resources.length === 0) return null;

    // Find the earliest reset date
    const resetDates = resources.map((r) => new Date(r.resetsAt));
    const earliestReset = new Date(Math.min(...resetDates.map((d) => d.getTime())));

    try {
      const now = new Date();
      const diffMs = earliestReset.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        return "Resets today";
      } else if (diffDays === 1) {
        return "Resets tomorrow";
      } else if (diffDays <= 7) {
        return `Resets in ${diffDays} days`;
      } else {
        return earliestReset.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    } catch {
      return "Resets soon";
    }
  };

  const nextResetDate = getNextResetDate();

  // Show loading state
  if (authLoading || isLoading) {
    return (
      <DashboardLayout title="Usage" subtitle="View your usage and limits">
        <UsagePageSkeleton />
      </DashboardLayout>
    );
  }

  // Show error state
  if (isError) {
    return (
      <DashboardLayout title="Usage" subtitle="View your usage and limits">
        <div className="p-6">
          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-inter font-semibold text-white mb-2">
                  Failed to load usage data
                </h3>
                <p className="text-sm text-[#a6a6a6] font-inter mb-4">
                  {error instanceof Error
                    ? error.message
                    : "An unexpected error occurred. Please try again."}
                </p>
                <Button
                  variant="primary"
                  size="default"
                  onClick={() => void refetch()}
                  disabled={isRefetching}
                  className="min-h-[44px]"
                >
                  {isRefetching ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Show empty state (should not happen in normal flow)
  if (!usageSummary) {
    return (
      <DashboardLayout title="Usage" subtitle="View your usage and limits">
        <div className="p-6">
          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] text-center">
            <p className="text-[#a6a6a6] font-inter">
              No usage data available.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Usage" subtitle="View your usage and limits">
      <div className="p-6 space-y-6">
        {/* Summary Panel */}
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-inter font-semibold">
                  {usageSummary.plan.name} Plan
                </h3>
                <p className="text-[#a6a6a6] font-inter text-sm">
                  {getWindowDaysText(usageSummary.windowDays)}
                </p>
              </div>
            </div>
            <button
              onClick={() => void refetch()}
              disabled={isRefetching}
              className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Refresh usage data"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 text-[#a6a6a6] ${
                  isRefetching ? "animate-spin" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="space-y-2">
            {nextResetDate && (
              <div className="flex items-center gap-2 text-sm text-[#a6a6a6] font-inter">
                <Calendar className="w-4 h-4" aria-hidden="true" />
                <span>{nextResetDate}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Link
                href="/pricing"
                className="text-sm font-inter font-medium text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e323a] rounded-md px-2 py-1 min-h-[44px] flex items-center"
              >
                View plans & upgrade
              </Link>
            </div>
          </div>
        </div>

        {/* High Usage Banner */}
        {hasHighUsage && (
          <UsageBanner
            pct={maxUsagePct}
            onUpgradeClick={() => {
              // Track upgrade CTA click from usage page
              // Analytics event can be added here if needed
            }}
          />
        )}

        {/* Resource Usage Progress Bars */}
        <div className="space-y-4">
          <h2 className="text-lg font-inter font-semibold text-white">
            Resource Usage
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedResources.map(([resourceName, usage]) => {
              // Transform resource usage for display (e.g., TTS seconds to minutes)
              const transformed = transformResourceUsage(
                resourceName,
                usage.used,
                usage.cap
              );

              return (
                <UsageProgress
                  key={resourceName}
                  resource={resourceName}
                  label={transformed.label}
                  used={transformed.used}
                  cap={transformed.cap}
                  pct={usage.pct}
                  resetsAt={usage.resetsAt}
                />
              );
            })}
          </div>

          {/* Empty state if no resources */}
          {sortedResources.length === 0 && (
            <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] text-center">
              <p className="text-[#a6a6a6] font-inter">
                No usage data available for your plan.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

