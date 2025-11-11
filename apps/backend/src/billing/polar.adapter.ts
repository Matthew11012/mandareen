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
        `Missing required webhook headers: signature=${!!signature}, id=${!!webhookId}, timestamp=${!!timestamp}`,
      );
      return false;
    }

    try {
      // Prepare signed payload
      const bodyString = rawBody.toString('utf-8');
      const signedPayload = `${webhookId}.${timestamp}.${bodyString}`;

      // Extract signature from header
      const signatureParts = signature.split(',');
      const receivedSignature =
        signatureParts.length > 1 ? signatureParts[1] : signatureParts[0];

      // Try using the secret directly as UTF-8 (most common for StandardWebhooks)
      const secretUtf8: Buffer = Buffer.from(this.webhookSecret, 'utf-8');
      const hmacUtf8 = crypto.createHmac('sha256', secretUtf8);
      hmacUtf8.update(signedPayload);
      const expectedSignatureUtf8 = hmacUtf8.digest('base64');

      if (expectedSignatureUtf8 === receivedSignature) {
        return true;
      }

      // If UTF-8 doesn't work, try base64-decoded secret
      try {
        const secretBase64 = Buffer.from(this.webhookSecret, 'base64');
        if (secretBase64.length > 0) {
          const hmacBase64 = crypto.createHmac('sha256', secretBase64);
          hmacBase64.update(signedPayload);
          const expectedSignatureBase64 = hmacBase64.digest('base64');

          if (expectedSignatureBase64 === receivedSignature) {
            return true;
          }
        }
      } catch (e) {
        this.logger.error(`Failed to try base64-decoded secret: ${e}`);
      }

      // Signature verification failed
      this.logger.error('Webhook signature verification failed');
      return false;
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
    // Polar webhook payload structure for customer events:
    // {
    //   "type": "customer.created",
    //   "data": {
    //     "id": "customer_id",
    //     "email": "email",
    //     "external_id": "external_id",
    //     "metadata": {}
    //   }
    // }
    const customer = payload.data;

    if (!customer || !customer.id) {
      this.logger.error(
        `Cannot extract customer ID from payload: ${JSON.stringify(payload).substring(0, 200)}`,
      );
      throw new Error('Customer ID not found in webhook payload');
    }

    return {
      externalCustomerId: customer.id,
      email: customer.email,
      metadata: customer.metadata || {},
      externalId: customer.external_id,
    };
  }

  /**
   * Extract subscription information from Polar webhook payload.
   * @param payload Polar webhook payload
   * @returns Subscription data with all relevant fields
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
    // Polar webhook payload structure for subscription events:
    // {
    //   "type": "subscription.active",
    //   "data": {
    //     "id": "subscription_id",
    //     "customer_id": "customer_id",
    //     "product_id": "product_id",
    //     "product": { "id": "product_id" },
    //     "prices": [{ "id": "price_id", ... }],
    //     "status": "active",
    //     "current_period_start": "2023-11-07T05:31:56Z",
    //     "current_period_end": "2023-11-07T05:31:56Z",
    //     "cancel_at_period_end": true,
    //     "trial_end": "2023-11-07T05:31:56Z"
    //   }
    // }
    const subscription = payload.data;

    if (!subscription || !subscription.id) {
      this.logger.error(
        `Cannot extract subscription ID from payload: ${JSON.stringify(payload).substring(0, 200)}`,
      );
      throw new Error('Subscription ID not found in webhook payload');
    }

    if (!subscription.customer_id) {
      this.logger.error(
        `Cannot extract customer ID from subscription payload: ${JSON.stringify(subscription).substring(0, 200)}`,
      );
      throw new Error('Customer ID not found in subscription payload');
    }

    // Product ID: primary field is product_id, fallback to product.id
    const externalProductId =
      subscription.product_id || subscription.product?.id;

    // Price ID: get from prices array if available
    const externalPriceId =
      subscription.prices && subscription.prices.length > 0
        ? subscription.prices[0].id
        : undefined;

    return {
      externalSubscriptionId: subscription.id,
      externalCustomerId: subscription.customer_id,
      externalPriceId,
      externalProductId,
      status: subscription.status || 'active',
      currentPeriodStart: new Date(
        subscription.current_period_start || Date.now(),
      ),
      currentPeriodEnd: new Date(subscription.current_period_end || Date.now()),
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end)
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
   * @param customerId External customer ID
   * @returns Customer session token and portal URL (if provided by API)
   */
  async createCustomerSession(
    customerId: string,
  ): Promise<{ token: string; customerPortalUrl?: string }> {
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

      const token =
        response.data.token ||
        response.data.session_token ||
        response.data.customer_session_token;
      const customerPortalUrl =
        response.data.customerPortalUrl ||
        response.data.customer_portal_url ||
        response.data.url;

      return {
        token: token,
        customerPortalUrl: customerPortalUrl,
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
