import { get } from "../http/http";

/**
 * Usage data for a single resource.
 */
export interface ResourceUsage {
  /**
   * Amount used in the rolling window.
   */
  used: number;

  /**
   * Cap/limit for this resource from the plan.
   */
  cap: number;

  /**
   * Percentage used (0-100).
   */
  pct: number;

  /**
   * ISO 8601 timestamp when the rolling window resets.
   * This is the end of the current window (oldest entry + windowDays).
   */
  resetsAt: string;
}

/**
 * Current plan information.
 */
export interface PlanInfo {
  /**
   * Plan code (e.g., 'FREE', 'BASIC', 'PREMIUM').
   */
  code: string;

  /**
   * Plan name (e.g., 'Free', 'Basic', 'Premium').
   */
  name: string;
}

/**
 * Usage summary response.
 * Mirrors the backend UsageSummaryDto contract.
 */
export interface UsageSummary {
  /**
   * Rolling window size in days (typically 30, but can vary by plan).
   */
  windowDays: number;

  /**
   * Usage data per resource.
   * Key is resource name (e.g., 'convo_message_text', 'convo_message_audio').
   */
  resources: Record<string, ResourceUsage>;

  /**
   * Current plan information.
   */
  plan: PlanInfo;
}

/**
 * Usage API client.
 * Provides functions for fetching usage data.
 */
export const usageApi = {
  /**
   * Get usage summary for the current user.
   * Aggregates usage data across all resources for the current billing period.
   * @returns Promise with usage summary
   * @throws Error on server errors
   */
  getSummary: async (): Promise<UsageSummary> => {
    return get<UsageSummary>("usage/summary");
  },
};
