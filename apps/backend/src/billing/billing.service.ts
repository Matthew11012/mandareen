import {
  Injectable,
  Logger,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PolarAdapter } from './polar.adapter';
import { CheckoutError, PortalUnavailableError } from './errors/billing.errors';

/**
 * Billing service for orchestrating billing operations.
 * Provides public API for checkout, plan resolution, and customer management.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly provider: string;
  private readonly billingPortalUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly polarAdapter: PolarAdapter,
    private readonly configService: ConfigService,
  ) {
    this.provider = this.configService.get<string>('BILLING_PROVIDER', 'polar');
    this.billingPortalUrl =
      this.configService.get<string>('BILLING_PORTAL_URL');
  }

  /**
   * Resolve plan from external product ID (Polar uses product IDs, not price IDs).
   * Note: PlanPrice.externalPriceId stores Polar product IDs (not price IDs).
   * @param externalProductId External product ID from billing provider (Polar product ID)
   * @returns Plan ID and code
   */
  async resolvePlanFromProduct(
    externalProductId: string,
  ): Promise<{ planId: number; planCode: string }> {
    const planPrice = await this.prisma.planPrice.findUnique({
      where: {
        provider_externalPriceId: {
          provider: this.provider,
          externalPriceId: externalProductId, // externalPriceId field stores product IDs
        },
      },
      include: {
        plan: true,
      },
    });

    if (!planPrice) {
      this.logger.error(
        `Plan not found for product ID: ${externalProductId} (provider: ${this.provider})`,
      );
      throw new NotFoundException(
        `Plan not found for product ID: ${externalProductId}`,
      );
    }

    if (!planPrice.isActive) {
      this.logger.warn(
        `Plan price is inactive: ${externalProductId} (provider: ${this.provider})`,
      );
      throw new CheckoutError(
        'Plan price is inactive',
        HttpStatus.NOT_FOUND,
        'The selected plan is no longer available',
      );
    }

    if (!planPrice.plan || !planPrice.plan.isActive) {
      this.logger.error(
        `Associated plan is inactive or missing for product ID: ${externalProductId}`,
      );
      throw new CheckoutError(
        'Plan is inactive or missing',
        HttpStatus.NOT_FOUND,
        'The selected plan is no longer available.',
      );
    }

    return {
      planId: planPrice.planId,
      planCode: planPrice.plan.code,
    };
  }

  /**
   * Resolve plan from external price ID (deprecated, use resolvePlanFromProduct).
   * @param externalPriceId External price ID from billing provider
   * @returns Plan ID
   * @deprecated Use resolvePlanFromProduct instead. Polar uses product IDs, not price IDs.
   */
  async resolvePlanFromPrice(
    externalPriceId: string,
  ): Promise<{ planId: number; planCode: string }> {
    // For backward compatibility, treat externalPriceId as product ID
    return this.resolvePlanFromProduct(externalPriceId);
  }

  /**
   * Ensure a billing customer exists for the user.
   * Creates customer in Polar if it doesn't exist, using external_id for linking.
   * @param userId User ID
   * @param email User email
   * @returns Billing customer
   */
  async ensureBillingCustomer(
    userId: number,
    email: string,
  ): Promise<{ externalCustomerId: string }> {
    // Check if billing customer already exists
    const existingCustomer = await this.prisma.billingCustomer.findUnique({
      where: {
        provider_userId: {
          provider: this.provider,
          userId,
        },
      },
    });

    if (existingCustomer) {
      return {
        externalCustomerId: existingCustomer.externalCustomerId,
      };
    }

    // Create customer in Polar with external_id for linking to internal user ID
    const { externalCustomerId } = await this.polarAdapter.createCustomer({
      email,
      externalId: userId.toString(), // Use external_id for direct linking
      metadata: {
        userId: userId.toString(), // Also include in metadata for redundancy
      },
    });

    // Store billing customer in database
    await this.prisma.billingCustomer.create({
      data: {
        userId,
        provider: this.provider,
        externalCustomerId,
      },
    });

    return {
      externalCustomerId,
    };
  }

  /**
   * Create checkout session for a plan.
   * @param userId User ID
   * @param planCode Plan code (e.g., 'BASIC', 'PREMIUM')
   * @param billingPeriod Optional billing period (defaults to 'monthly')
   * @param successUrl Optional success URL (defaults to frontend URL)
   * @param cancelUrl Optional cancel URL (defaults to frontend URL)
   * @returns Checkout URL
   * Note: PlanPrice.externalPriceId stores Polar product IDs (not price IDs)
   */
  async createCheckout(
    userId: number,
    planCode: string,
    billingPeriod: string = 'monthly',
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ url: string }> {
    // Validate plan code (FREE plan cannot be purchased)
    if (planCode === 'FREE') {
      throw new CheckoutError(
        'Invalid plan',
        HttpStatus.BAD_REQUEST,
        'FREE plan cannot be purchased. It is the default plan.',
      );
    }

    // Resolve plan with prices for the specified billing period
    const plan = await this.prisma.plan.findUnique({
      where: { code: planCode },
      include: {
        prices: {
          where: {
            provider: this.provider,
            billingPeriod: billingPeriod,
            isActive: true,
          },
        },
      },
    });

    if (!plan) {
      throw new CheckoutError(
        'Plan not found',
        HttpStatus.NOT_FOUND,
        `Plan with code "${planCode}" not found`,
      );
    }

    if (!plan.isActive) {
      throw new CheckoutError(
        'Plan is inactive',
        HttpStatus.NOT_FOUND,
        `Plan "${planCode}" is no longer available`,
      );
    }

    if (plan.prices.length === 0) {
      throw new CheckoutError(
        'Plan price not found',
        HttpStatus.NOT_FOUND,
        `No active price found for plan "${planCode}" with billing period "${billingPeriod}" (provider: ${this.provider})`,
      );
    }

    const planPrice = plan.prices[0];
    // PlanPrice.externalPriceId stores Polar product IDs (not price IDs)
    const productId = planPrice.externalPriceId;

    // Get user email
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new CheckoutError(
        'User not found',
        HttpStatus.NOT_FOUND,
        `User with ID ${userId} not found`,
      );
    }

    // Ensure billing customer exists (with external_id)
    const { externalCustomerId } = await this.ensureBillingCustomer(
      userId,
      user.email,
    );

    // Get frontend URL for default redirect URLs
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const defaultSuccessUrl = `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${frontendUrl}/billing/cancel`;

    // Create checkout session in Polar using product IDs
    // Note: Polar supports multiple products in checkout (users can switch between them)
    // For now, we're creating checkout with a single product for the selected billing period
    const { url } = await this.polarAdapter.createCheckout({
      productIds: [productId], // Polar uses products array (product IDs)
      externalCustomerId: externalCustomerId, // Use external_customer_id (not customer_id)
      metadata: {
        userId: userId.toString(),
        planCode: plan.code,
        billingPeriod: billingPeriod,
      },
      successUrl: successUrl || defaultSuccessUrl,
      cancelUrl: cancelUrl || defaultCancelUrl,
    });

    return { url };
  }

  /**
   * Get billing portal URL or token for a user.
   * @param userId User ID
   * @returns Portal URL or token
   * Note: Polar uses Customer Portal API with tokens, not direct URLs
   */
  async getBillingPortalUrl(userId: number): Promise<{ url: string }> {
    if (this.billingPortalUrl) {
      // If a static URL is configured, return it
      return { url: this.billingPortalUrl };
    }

    // Otherwise, attempt to create a customer session via Polar
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: {
        provider_userId: {
          provider: this.provider,
          userId: userId,
        },
      },
    });

    if (!billingCustomer) {
      throw new PortalUnavailableError(
        'No billing customer found for user, cannot create portal session.',
      );
    }

    try {
      // Create customer session (returns token and optionally portal URL)
      const { token, customerPortalUrl } =
        await this.polarAdapter.createCustomerSession(
          billingCustomer.externalCustomerId,
        );

      // If API returns customerPortalUrl directly, use it
      if (customerPortalUrl) {
        return {
          url: customerPortalUrl,
        };
      }

      // Otherwise, construct portal URL from API base URL
      // API Base URLs (with or without /v1):
      // - Production: https://api.polar.sh or https://api.polar.sh/v1
      // - Sandbox: https://sandbox-api.polar.sh or https://sandbox-api.polar.sh/v1
      // Portal URLs (for authenticated sessions):
      // - Production: https://polar.sh/portal?token=...
      // - Sandbox: https://sandbox.polar.sh/portal?token=...
      const apiBaseUrl =
        this.configService.get<string>('POLAR_API_BASE_URL') ||
        'https://api.polar.sh';

      let portalBaseUrl: string;

      try {
        // Parse the API base URL to extract the hostname
        const urlObj = new URL(apiBaseUrl);
        const hostname = urlObj.hostname;

        // Convert API hostname to portal hostname
        if (hostname === 'sandbox-api.polar.sh') {
          // Sandbox: sandbox-api.polar.sh -> sandbox.polar.sh
          portalBaseUrl = 'https://sandbox.polar.sh';
        } else if (hostname === 'api.sandbox.polar.sh') {
          // Legacy sandbox format: api.sandbox.polar.sh -> sandbox.polar.sh
          portalBaseUrl = 'https://sandbox.polar.sh';
        } else if (hostname === 'api.polar.sh') {
          // Production: api.polar.sh -> polar.sh
          portalBaseUrl = 'https://polar.sh';
        } else if (hostname.includes('sandbox')) {
          // Fallback: any sandbox hostname -> sandbox.polar.sh
          this.logger.warn(
            `Unexpected sandbox hostname format: ${hostname}, using sandbox.polar.sh`,
          );
          portalBaseUrl = 'https://sandbox.polar.sh';
        } else {
          // Fallback: assume production
          this.logger.warn(
            `Unexpected API hostname format: ${hostname}, using polar.sh`,
          );
          portalBaseUrl = 'https://polar.sh';
        }
      } catch (urlError) {
        // If URL parsing fails, try string replacement as fallback
        this.logger.warn(
          `Failed to parse API base URL: ${apiBaseUrl}, using string replacement. Error: ${urlError instanceof Error ? urlError.message : String(urlError)}`,
        );

        if (apiBaseUrl.includes('sandbox-api.polar.sh')) {
          portalBaseUrl = apiBaseUrl.replace(
            'sandbox-api.polar.sh',
            'sandbox.polar.sh',
          );
        } else if (apiBaseUrl.includes('api.sandbox.polar.sh')) {
          portalBaseUrl = apiBaseUrl.replace(
            'api.sandbox.polar.sh',
            'sandbox.polar.sh',
          );
        } else if (apiBaseUrl.includes('api.polar.sh')) {
          portalBaseUrl = apiBaseUrl.replace('api.polar.sh', 'polar.sh');
        } else {
          // Ultimate fallback
          portalBaseUrl = apiBaseUrl.includes('sandbox')
            ? 'https://sandbox.polar.sh'
            : 'https://polar.sh';
        }

        // Remove /v1 if present
        portalBaseUrl = portalBaseUrl.replace(/\/v1\/?$/, '');
      }

      // Construct portal URL with token
      // Note: For authenticated sessions, the URL format is /portal?token=...
      // (The token authenticates the user, so org slug is not needed in the URL)
      const portalUrl = `${portalBaseUrl}/portal?token=${token}`;

      return {
        url: portalUrl,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create Polar billing portal session for user ${userId}`,
        error,
      );
      throw new PortalUnavailableError(
        'Failed to generate billing portal URL from provider.',
      );
    }
  }
}
