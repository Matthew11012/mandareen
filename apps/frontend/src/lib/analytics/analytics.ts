/**
 * Analytics utility for tracking events across the application.
 *
 * This module provides a simple, extensible interface for tracking analytics events
 * while respecting user opt-out preferences. It can be extended to integrate with
 * any analytics service (Google Analytics, Plausible, PostHog, Mixpanel, etc.).
 *
 * Features:
 * - Respects user opt-out preferences (stored in localStorage)
 * - Configurable via environment variables
 * - Type-safe event tracking
 * - No-op when analytics is disabled or user has opted out
 */

/**
 * Analytics event names for pricing page
 */
export const AnalyticsEvent = {
  // Pricing page events
  PRICING_PAGE_VIEWED: "pricing_page_viewed",
  PRICING_PLAN_VIEWED: "pricing_plan_viewed",
  PRICING_CTA_CLICKED: "pricing_cta_clicked",
  PRICING_CHECKOUT_STARTED: "pricing_checkout_started",
  PRICING_CHECKOUT_SUCCESS: "pricing_checkout_success",
  PRICING_CHECKOUT_FAILURE: "pricing_checkout_failure",
  PRICING_BILLING_PERIOD_CHANGED: "pricing_billing_period_changed",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

/**
 * Analytics event properties
 */
export interface AnalyticsEventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Check if analytics is enabled
 */
function isAnalyticsEnabled(): boolean {
  // Check if analytics is disabled via environment variable
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "false") {
    return false;
  }

  // Check if user has opted out (stored in localStorage)
  if (typeof window !== "undefined") {
    const optOut = localStorage.getItem("analytics_opt_out");
    if (optOut === "true") {
      return false;
    }
  }

  // Default: enabled (can be overridden by environment variable)
  return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false";
}

/**
 * Get user opt-out preference
 */
export function isAnalyticsOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("analytics_opt_out") === "true";
}

/**
 * Set user opt-out preference
 */
export function setAnalyticsOptOut(optedOut: boolean): void {
  if (typeof window === "undefined") return;
  if (optedOut) {
    localStorage.setItem("analytics_opt_out", "true");
  } else {
    localStorage.removeItem("analytics_opt_out");
  }
}

/**
 * Track an analytics event
 *
 * @param eventName - Name of the event to track
 * @param properties - Optional event properties
 */
export function trackEvent(
  eventName: AnalyticsEventName | string,
  properties?: AnalyticsEventProperties,
): void {
  // Don't track if analytics is disabled or user has opted out
  if (!isAnalyticsEnabled()) {
    return;
  }

  // In development, log events to console for debugging
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[Analytics]", eventName, properties || {});
  }

  // TODO: Integrate with analytics service (Google Analytics, Plausible, PostHog, etc.)
  // Example integrations:
  //
  // Google Analytics 4:
  // if (typeof window !== "undefined" && window.gtag) {
  //   window.gtag("event", eventName, properties);
  // }
  //
  // Plausible:
  // if (typeof window !== "undefined" && window.plausible) {
  //   window.plausible(eventName, { props: properties });
  // }
  //
  // PostHog:
  // if (typeof window !== "undefined" && window.posthog) {
  //   window.posthog.capture(eventName, properties);
  // }
  //
  // Custom API endpoint:
  // fetch("/api/analytics", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ eventName, properties }),
  // }).catch(() => {
  //   // Silently fail if analytics endpoint is unavailable
  // });

  // For now, events are logged to console in development
  // This allows the team to verify events are being tracked correctly
  // before integrating with a production analytics service
}

/**
 * Track a page view
 *
 * @param pageName - Name of the page
 * @param properties - Optional page properties
 */
export function trackPageView(
  pageName: string,
  properties?: AnalyticsEventProperties,
): void {
  trackEvent("page_view", {
    page: pageName,
    ...properties,
  });
}

