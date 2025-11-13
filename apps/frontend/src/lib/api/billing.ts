import { z } from "zod";
import { get, post } from "../http/http";

/**
 * Billing period options for checkout.
 */
export enum BillingPeriod {
  MONTHLY = "monthly",
  SIX_MONTH = "6month",
  YEARLY = "yearly",
}

/**
 * Validation schema for checkout request.
 */
export const createCheckoutSchema = z.object({
  planCode: z.string().min(1, "Plan code is required"),
  billingPeriod: z.nativeEnum(BillingPeriod).optional(),
});

/**
 * Type for checkout request data.
 */
export type CreateCheckoutData = z.infer<typeof createCheckoutSchema>;

/**
 * Response from checkout endpoint.
 */
export interface CheckoutResponse {
  url: string;
}

/**
 * Response from billing portal endpoint.
 */
export interface PortalResponse {
  url: string;
}

/**
 * Error response when portal is unavailable.
 */
export interface PortalUnavailableError extends Error {
  status: number;
  code: string;
  message: string;
}

/**
 * Billing API client.
 * Provides functions for checkout and billing portal access.
 */
export const billingApi = {
  /**
   * Create a checkout session for a plan.
   * @param planCode Plan code (e.g., 'BASIC', 'PREMIUM'). FREE plan is not allowed.
   * @param billingPeriod Optional billing period (defaults to 'monthly').
   * @returns Promise with checkout URL
   * @throws Error on validation failures or server errors
   */
  checkout: async (
    planCode: string,
    billingPeriod?: BillingPeriod
  ): Promise<CheckoutResponse> => {
    try {
      const validatedData = createCheckoutSchema.parse({
        planCode,
        billingPeriod,
      });
      return post<CheckoutResponse>("billing/checkout", validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`
        );
      }
      throw error;
    }
  },

  /**
   * Get billing portal URL for the current user.
   * @returns Promise with portal URL
   * @throws PortalUnavailableError if portal is unavailable (404) or other errors
   */
  portal: async (): Promise<PortalResponse> => {
    try {
      return await get<PortalResponse>("billing/portal");
    } catch (error) {
      // Handle 404 specifically for portal unavailability
      // Backend returns structured error: { code: 'PORTAL_UNAVAILABLE', message: '...' }
      if (
        error instanceof Error &&
        "status" in error &&
        (error as { status: number }).status === 404
      ) {
        // Extract error code and message from error response
        // The http() client attaches the response data to the error
        const errorWithResponse = error as Error & {
          response?: { code?: string; message?: string };
        };
        const errorCode =
          errorWithResponse.response?.code || "PORTAL_UNAVAILABLE";
        const errorMessage =
          errorWithResponse.response?.message ||
          error.message ||
          "Billing portal is not available. Please contact support.";

        const portalError: PortalUnavailableError = {
          ...error,
          name: "PortalUnavailableError",
          status: 404,
          code: errorCode,
          message: errorMessage,
        };
        throw portalError;
      }
      throw error;
    }
  },
};
