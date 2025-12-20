"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { usageApi, type UsageSummary } from "@/lib/api/usage";

/**
 * Query keys for usage queries.
 */
const qk = {
  summary: ["usage", "summary"] as const,
};

/**
 * Hook for fetching usage summary.
 * Uses short stale time (30s) for near-real-time updates and 5min cache time.
 * @param enabled Whether to enable the query (defaults to true)
 * @returns Query hook for usage summary
 */
export function useUsageSummary(enabled: boolean = true) {
  return useQuery({
    queryKey: qk.summary,
    queryFn: () => usageApi.getSummary(),
    enabled,
    staleTime: 30 * 1000, // 30 seconds (as per Phase 4 spec)
    gcTime: 5 * 60 * 1000, // 5 minutes (cacheTime, as per Phase 4 spec)
    refetchOnWindowFocus: false, // Avoid extra calls on focus; data is already fresh enough
    refetchOnReconnect: true, // Refetch on reconnect
  });
}

/**
 * Helper to invalidate usage summary cache.
 * Useful for optimistic updates after mutations that affect usage.
 * @returns Function to invalidate usage summary
 */
export function useInvalidateUsageSummary() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.summary });
  }, [queryClient]);
}

/**
 * Helper to update usage summary cache optimistically.
 * Useful for optimistic updates when usage events occur.
 * @param updater Function to update the usage summary
 */
export function useUpdateUsageSummary() {
  const queryClient = useQueryClient();

  return useCallback(
    (updater: (prev: UsageSummary | undefined) => UsageSummary) => {
      queryClient.setQueryData<UsageSummary>(qk.summary, (old) => updater(old));
    },
    [queryClient]
  );
}

/**
 * Helper to get current usage summary from cache without refetching.
 * @returns Current usage summary or undefined if not in cache
 */
export function useUsageSummaryCache() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    return queryClient.getQueryData<UsageSummary>(qk.summary);
  }, [queryClient]);
}
