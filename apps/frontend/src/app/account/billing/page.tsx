"use client";

import React, { useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import {
  useBillingPortal,
  isPortalUnavailableError,
  getPortalErrorMessage,
} from "@/lib/hooks/use-billing";
import { useUsageSummary } from "@/lib/hooks/use-usage";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { trackPageView } from "@/lib/analytics/analytics";

/**
 * Skeleton loader for billing page.
 */
function BillingPageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Main Card Skeleton */}
      <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040] animate-pulse">
        <div className="h-6 w-48 bg-gray-700 rounded mb-4" />
        <div className="h-4 w-64 bg-gray-700 rounded mb-6" />
        <div className="h-11 w-48 bg-gray-700 rounded" />
      </div>

      {/* Info Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-[#2e323a] rounded-xl p-4 border border-[#404040] animate-pulse"
          >
            <div className="h-4 w-32 bg-gray-700 rounded mb-3" />
            <div className="h-3 w-48 bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Billing Page Component
 *
 * Features:
 * - "Manage subscription" button that redirects to billing portal
 * - Handles 404/unsupported portal errors gracefully
 * - Includes link to pricing page for upgrades
 * - Loading states with spinner
 * - Error banner with focus management
 * - Toast notification for redirect
 * - Accessible with proper ARIA attributes
 * - Keyboard navigation support
 */
export default function BillingPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const {
    data: portalData,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useBillingPortal(!authLoading);

  // Get user's current plan to customize error messages
  const { data: usageSummary } = useUsageSummary(!authLoading);
  const isFreePlan = usageSummary?.plan.code === "FREE";

  // Ref for error banner to manage focus
  const errorBannerRef = useRef<HTMLDivElement>(null);

  // Track page view
  useEffect(() => {
    trackPageView("billing", {});
  }, []);

  // Focus error banner on error
  useEffect(() => {
    if (isError && errorBannerRef.current) {
      // Use setTimeout to ensure the banner is rendered before focusing
      setTimeout(() => {
        errorBannerRef.current?.focus();
      }, 100);
    }
  }, [isError]);

  // Handle portal redirect
  const handleManageSubscription = async () => {
    try {
      // If we already have portal data, use it
      if (portalData?.url) {
        toast.info("Redirecting to billing portal...", {
          duration: 2000,
        });
        // Small delay to show toast, then redirect
        setTimeout(() => {
          window.location.href = portalData.url;
        }, 300);
        return;
      }

      // Otherwise, refetch to get the portal URL
      const result = await refetch();
      if (result.data?.url) {
        toast.info("Redirecting to billing portal...", {
          duration: 2000,
        });
        setTimeout(() => {
          window.location.href = result.data.url;
        }, 300);
      }
    } catch (err) {
      // Error is already handled by the query state
      // Just show a toast for user feedback
      const errorMessage = getPortalErrorMessage(err);
      toast.error(errorMessage, {
        duration: 5000,
      });
    }
  };

  // Show loading skeleton
  if (isLoading || authLoading) {
    return (
      <DashboardLayout
        title="Billing"
        subtitle="Manage your subscription and billing"
      >
        <BillingPageSkeleton />
      </DashboardLayout>
    );
  }

  // Determine if portal is unavailable
  const portalUnavailable = isError && isPortalUnavailableError(error);

  return (
    <DashboardLayout
      title="Billing"
      subtitle="Manage your subscription and billing"
    >
      <div className="p-6 space-y-6">
        {/* Main Billing Card */}
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-inter font-semibold text-white mb-2">
                Manage Subscription
              </h2>
              <p className="text-sm text-[#a6a6a6] font-inter">
                Update your payment method, change your plan, or cancel your
                subscription through our secure billing portal.
              </p>
            </div>
          </div>

          {/* Error Banner (if portal unavailable) */}
          {portalUnavailable && (
            <div
              ref={errorBannerRef}
              className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
              tabIndex={-1}
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  {isFreePlan ? (
                    <>
                      <p className="text-sm font-inter font-semibold text-amber-400 mb-2">
                        Manage subscription is not available for free plans
                      </p>
                      <p className="text-sm text-amber-400/80 font-inter mb-3">
                        You&apos;re currently on the free plan. To access the
                        billing portal and manage your subscription, upgrade to
                        a paid plan.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-inter font-semibold text-amber-400 mb-2">
                        Billing portal is currently unavailable
                      </p>
                      <p className="text-sm text-amber-400/80 font-inter mb-3">
                        We&apos;re experiencing technical difficulties accessing
                        the billing portal. This may be a temporary issue.
                      </p>
                      <p className="text-sm text-amber-400/80 font-inter mb-3">
                        Please try again later or contact support for assistance
                        with your subscription management.
                      </p>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void refetch()}
                          disabled={isRefetching}
                          loading={isRefetching}
                          className="min-h-[44px]"
                        >
                          {isRefetching ? "Retrying..." : "Try again"}
                        </Button>
                        <Link
                          href="/pricing"
                          className="inline-flex items-center gap-2 text-sm font-inter font-medium text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e323a] rounded-md px-2 py-1 min-h-[44px] flex items-center"
                        >
                          View plans
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Generic Error Banner (non-404 errors) */}
          {isError && !portalUnavailable && (
            <div
              ref={errorBannerRef}
              className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
              tabIndex={-1}
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-inter font-semibold text-red-400 mb-2">
                    Failed to load billing portal
                  </p>
                  <p className="text-sm text-red-400/80 font-inter mb-3">
                    {getPortalErrorMessage(error)}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void refetch()}
                    disabled={isRefetching}
                    loading={isRefetching}
                    className="min-h-[44px]"
                  >
                    {isRefetching ? "Retrying..." : "Retry"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Manage Subscription Button */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="primary"
              size="default"
              onClick={handleManageSubscription}
              disabled={isRefetching || portalUnavailable}
              loading={isRefetching}
              className="min-h-[44px] px-4"
              aria-label="Open billing portal to manage subscription"
            >
              {isRefetching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <span className="text-xs font-inter">
                    Manage subscription
                  </span>
                  <ExternalLink
                    className="w-4 h-4 flex-shrink-0"
                    aria-hidden="true"
                  />
                </>
              )}
            </Button>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-transparent border border-[#404040] text-white text-sm font-inter font-medium rounded-[14px] hover:bg-[#2e323a] hover:border-[#505050] hover:text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e323a] min-h-[44px] group"
            >
              <span>View plans & upgrade</span>
              <ArrowRight
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Payment Method Card */}
          <div className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]">
            <h3 className="text-sm font-inter font-semibold text-white mb-2">
              Payment Method
            </h3>
            <p className="text-xs text-[#a6a6a6] font-inter">
              Update your payment method, view billing history, and manage
              invoices in the billing portal.
            </p>
          </div>

          {/* Subscription Management Card */}
          <div className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]">
            <h3 className="text-sm font-inter font-semibold text-white mb-2">
              Subscription Management
            </h3>
            <p className="text-xs text-[#a6a6a6] font-inter">
              Change your plan, update billing period, or cancel your
              subscription at any time.
            </p>
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-[#2e323a] rounded-xl p-4 border border-[#404040]">
          <h3 className="text-sm font-inter font-semibold text-white mb-2">
            Need Help?
          </h3>
          <p className="text-xs text-[#a6a6a6] font-inter mb-3">
            If you&apos;re experiencing issues accessing the billing portal or
            need assistance with your subscription, please contact our support
            team.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-sm font-inter font-medium text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e323a] rounded-md px-2 py-1 min-h-[44px] flex items-center"
          >
            View available plans
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
