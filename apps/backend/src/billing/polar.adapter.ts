import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * Polar adapter for billing operations.
 * Encapsulates all Polar-specific API calls and webhook verification.
 */
@Injectable()
export class PolarAdapter {
  private readonly logger = new Logger(PolarAdapter.name);
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('POLAR_API_KEY') || '';
    this.webhookSecret =
      this.configService.get<string>('POLAR_WEBHOOK_SECRET') || '';
    this.apiBaseUrl =
      this.configService.get<string>('POLAR_API_BASE_URL') ||
      'https://api.polar.sh';

    if (!this.apiKey) {
      this.logger.warn('POLAR_API_KEY is not set');
    }
    if (!this.webhookSecret) {
      this.logger.warn('POLAR_WEBHOOK_SECRET is not set');
    }
  }

  /**
   * Verify webhook signature using StandardWebhooks specification.
   * Polar uses StandardWebhooks with webhook-signature, webhook-id, and webhook-timestamp headers.
   * @param rawBody Raw request body as Buffer
   * @param headers Headers containing webhook-signature, webhook-id, webhook-timestamp
   * @returns true if signature is valid, false otherwise
   */
  verifySignature(
    rawBody: Buffer,
    headers: {
      'webhook-signature'?: string;
      'webhook-id'?: string;
      'webhook-timestamp'?: string;
    },
  ): boolean {
    if (!this.webhookSecret) {
      this.logger.error(
        'POLAR_WEBHOOK_SECRET is not set, cannot verify signature',
      );
      return false;
    }

    const signature = headers['webhook-signature'];
    const webhookId = headers['webhook-id'];
    const timestamp = headers['webhook-timestamp'];

    if (!signature || !webhookId || !timestamp) {
      this.logger.error(
        'Missing required webhook headers: webhook-signature, webhook-id, webhook-timestamp',
      );
      return false;
    }

    try {
      // StandardWebhooks requires base64-encoded secret
      // The secret from Polar is already in the correct format, but we need to ensure it's base64
      let secret: Buffer;
      try {
        // Try to decode as base64 first (Polar provides base64-encoded secrets)
        secret = Buffer.from(this.webhookSecret, 'base64');
      } catch {
        // If not base64, use the raw secret (fallback for compatibility)
        secret = Buffer.from(this.webhookSecret, 'utf-8');
      }

      // StandardWebhooks signature format: signed_payload = webhook_id + "." + timestamp + "." + body
      const signedPayload = `${webhookId}.${timestamp}.${rawBody.toString('utf-8')}`;

      // Compute HMAC-SHA256
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(signedPayload);
      const expectedSignature = hmac.digest('base64');

      // Extract signature from header (may be in format "v1,signature" or just "signature")
      const receivedSignature =
        signature.split(',')[1] || signature.split(',')[0];

      // Use constant-time comparison to prevent timing attacks
      const expectedBuffer = Buffer.from(expectedSignature, 'base64');
      const receivedBuffer = Buffer.from(receivedSignature, 'base64');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (error) {
      this.logger.error('Error verifying webhook signature', error);
      return false;
    }
  }

  /**
   * Extract customer information from Polar webhook payload.
   * @param payload Polar webhook payload
   * @returns Customer data with externalCustomerId, email, and external_id
   */
  extractCustomer(payload: any): {
    externalCustomerId: string;
    email?: string;
    metadata?: Record<string, string>;
    externalId?: string;
  } {
    // Polar customer object structure
    // Adjust based on actual Polar API response structure
    const customer = payload.data?.object || payload.customer || payload;

    return {
      externalCustomerId: customer.id || customer.customer_id,
      email: customer.email,
      metadata: customer.metadata || {},
      externalId: customer.external_id || customer.externalId,
    };
  }

  /**
   * Extract subscription information from Polar webhook payload.
   * @param payload Polar webhook payload
   * @returns Subscription data with all relevant fields
   * Note: Polar may use product_id instead of price_id in subscription payloads
   */
  extractSubscription(payload: any): {
    externalSubscriptionId: string;
    externalCustomerId: string;
    externalPriceId?: string;
    externalProductId?: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    trialEnd?: Date;
  } {
    // Polar subscription object structure
    // Adjust based on actual Polar API response structure
    const subscription =
      payload.data?.object || payload.subscription || payload;

    return {
      externalSubscriptionId: subscription.id || subscription.subscription_id,
      externalCustomerId:
        subscription.customer_id ||
        subscription.customer?.id ||
        payload.customer_id,
      // Polar may use product_id instead of price_id
      externalPriceId:
        subscription.price_id || subscription.price?.id || payload.price_id,
      externalProductId:
        subscription.product_id ||
        subscription.product?.id ||
        payload.product_id,
      status: subscription.status || 'active',
      currentPeriodStart: new Date(
        subscription.current_period_start ||
          subscription.currentPeriodStart ||
          Date.now(),
      ),
      currentPeriodEnd: new Date(
        subscription.current_period_end ||
          subscription.currentPeriodEnd ||
          Date.now(),
      ),
      cancelAtPeriodEnd:
        subscription.cancel_at_period_end ||
        subscription.cancelAtPeriodEnd ||
        false,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end)
        : subscription.trialEnd
          ? new Date(subscription.trialEnd)
          : undefined,
    };
  }

  /**
   * Create a customer in Polar.
   * @param args Customer creation arguments with external_id for linking to internal user ID
   * @returns External customer ID
   */
  async createCustomer(args: {
    email: string;
    externalId?: string;
    metadata?: Record<string, string>;
  }): Promise<{ externalCustomerId: string }> {
    if (!this.apiKey) {
      throw new Error('POLAR_API_KEY is not set');
    }

    try {
      const requestBody: any = {
        email: args.email,
      };

      // Use external_id for linking to internal user ID (preferred over metadata)
      if (args.externalId) {
        requestBody.external_id = args.externalId;
      }

      // Include metadata if provided
      if (args.metadata && Object.keys(args.metadata).length > 0) {
        requestBody.metadata = args.metadata;
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.apiBaseUrl}/v1/customers`, requestBody, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 seconds
        }),
      );

      const customerId = response.data.id || response.data.customer_id;
      this.logger.log(
        `Created Polar customer: ${customerId}${args.externalId ? ` (external_id: ${args.externalId})` : ''}`,
      );

      return {
        externalCustomerId: customerId,
      };
    } catch (error: any) {
      this.logger.error('Error creating Polar customer', error?.response?.data);
      throw new Error(
        `Failed to create Polar customer: ${error?.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Create a checkout session in Polar.
   * @param args Checkout creation arguments
   * @returns Checkout URL
   * Note: Polar uses products array (product IDs) instead of price_id
   */
  async createCheckout(args: {
    productIds: string[];
    externalCustomerId?: string;
    metadata?: Record<string, string>;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ url: string }> {
    if (!this.apiKey) {
      throw new Error('POLAR_API_KEY is not set');
    }

    if (!args.productIds || args.productIds.length === 0) {
      throw new Error('At least one product ID is required');
    }

    try {
      const requestBody: any = {
        products: args.productIds,
      };

      // Use external_customer_id (not customer_id) for linking to external user ID
      if (args.externalCustomerId) {
        requestBody.external_customer_id = args.externalCustomerId;
      }

      if (args.metadata && Object.keys(args.metadata).length > 0) {
        requestBody.metadata = args.metadata;
      }

      if (args.successUrl) {
        requestBody.success_url = args.successUrl;
      }

      if (args.cancelUrl) {
        requestBody.cancel_url = args.cancelUrl;
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.apiBaseUrl}/v1/checkouts/`, requestBody, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 seconds
        }),
      );

      const checkoutUrl = response.data.url || response.data.checkout_url;
      this.logger.log(
        `Created Polar checkout session: ${checkoutUrl} (products: ${args.productIds.join(', ')})`,
      );

      return {
        url: checkoutUrl,
      };
    } catch (error: any) {
      this.logger.error('Error creating Polar checkout', error?.response?.data);
      throw new Error(
        `Failed to create Polar checkout: ${error?.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Create a customer session for Customer Portal API access.
   * Polar uses customer sessions (tokens) instead of direct portal URLs.
   * @param customerId External customer ID
   * @returns Customer session token
   * Note: This returns a token, not a URL. The Customer Portal API must be used with this token.
   */
  async createCustomerSession(customerId: string): Promise<{ token: string }> {
    if (!this.apiKey) {
      throw new Error('POLAR_API_KEY is not set');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiBaseUrl}/v1/customer-sessions/`,
          {
            customer_id: customerId,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 seconds
          },
        ),
      );

      const token = response.data.token || response.data.session_token;
      this.logger.log(
        `Created Polar customer session for customer: ${customerId}`,
      );

      return {
        token: token,
      };
    } catch (error: any) {
      this.logger.error(
        'Error creating Polar customer session',
        error?.response?.data,
      );
      throw new Error(
        `Failed to create Polar customer session: ${error?.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Get billing portal URL for a customer (deprecated, use createCustomerSession instead).
   * @param customerId External customer ID
   * @returns Portal URL
   * @deprecated Use createCustomerSession instead. Polar uses Customer Portal API with tokens.
   */
  async getPortalUrl(customerId: string): Promise<{ url: string }> {
    this.logger.warn(
      'getPortalUrl is deprecated. Use createCustomerSession instead.',
    );
    // For backward compatibility, create a customer session
    // and return a placeholder URL that includes the token
    // In practice, the frontend should use the Customer Portal API with the token
    const { token } = await this.createCustomerSession(customerId);
    // Return a token-based URL (frontend should handle this)
    return {
      url: `polar://customer-portal?token=${token}`,
    };
  }

  /**
   * List subscriptions for a customer (optional, for reconciliation).
   * @param customerId External customer ID
   * @returns List of subscriptions
   */
  async listSubscriptions(customerId: string): Promise<any[]> {
    if (!this.apiKey) {
      throw new Error('POLAR_API_KEY is not set');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiBaseUrl}/v1/subscriptions`, {
          params: {
            customer_id: customerId,
          },
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }),
      );

      return response.data.data || response.data.subscriptions || [];
    } catch (error: any) {
      this.logger.error(
        'Error listing Polar subscriptions',
        error?.response?.data,
      );
      throw new Error(
        `Failed to list Polar subscriptions: ${error?.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Retrieve a subscription by ID (optional, for reconciliation).
   * @param subscriptionId External subscription ID
   * @returns Subscription data
   */
  async retrieveSubscription(subscriptionId: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('POLAR_API_KEY is not set');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.apiBaseUrl}/v1/subscriptions/${subscriptionId}`,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: 10000,
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(
        'Error retrieving Polar subscription',
        error?.response?.data,
      );
      throw new Error(
        `Failed to retrieve Polar subscription: ${error?.message || 'Unknown error'}`,
      );
    }
  }
}
