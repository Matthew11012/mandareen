"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  billingApi,
  type PortalUnavailableError,
  BillingPeriod,
} from "@/lib/api/billing";

/**
 * Query keys for billing queries.
 */
const qk = {
  portal: ["billing", "portal"] as const,
};

/**
 * Hook for creating a checkout session.
 * @returns Mutation hook for checkout
 */
export function useCheckoutMutation() {
  return useMutation({
    mutationFn: ({
      planCode,
      billingPeriod,
    }: {
      planCode: string;
      billingPeriod?: BillingPeriod;
    }) => billingApi.checkout(planCode, billingPeriod),
    retry: false, // Don't retry mutations
  });
}

/**
 * Hook for getting billing portal URL.
 * @param enabled Whether to enable the query (defaults to true)
 * @returns Query hook for billing portal URL
 */
export function useBillingPortal(enabled: boolean = true) {
  return useQuery({
    queryKey: qk.portal,
    queryFn: () => billingApi.portal(),
    enabled,
    retry: (failureCount, error) => {
      // Don't retry on 404 (portal unavailable)
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        (error as { status: number }).status === 404
      ) {
        return false;
      }
      // Retry up to 2 times for other errors
      return failureCount < 2;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (portal URL changes infrequently)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Helper to check if an error is a portal unavailable error.
 * @param error Error to check
 * @returns True if error is PortalUnavailableError
 */
export function isPortalUnavailableError(
  error: unknown
): error is PortalUnavailableError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "PORTAL_UNAVAILABLE"
  );
}

/**
 * Helper to get portal error message for UI display.
 * @param error Error to extract message from
 * @returns User-friendly error message
 */
export function getPortalErrorMessage(error: unknown): string {
  if (isPortalUnavailableError(error)) {
    return "Billing portal is not available. Please contact support for assistance with your subscription.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred. Please try again or contact support.";
}
