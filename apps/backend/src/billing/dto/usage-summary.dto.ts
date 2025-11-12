/**
 * DTO for usage summary response.
 * Represents rolling window usage data for all resources in a user's plan.
 */
export class UsageSummaryDto {
  /**
   * Rolling window size in days (typically 30).
   */
  windowDays: number;

  /**
   * Usage data per resource.
   * Key is resource name (e.g., 'convo_message_text').
   */
  resources: Record<
    string,
    {
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
  >;

  /**
   * Current plan information.
   */
  plan: {
    code: string;
    name: string;
  };
}

