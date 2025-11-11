import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PolarAdapter } from './polar.adapter';
import { BillingService } from './billing.service';

/**
 * Billing webhook service for processing webhook events from billing providers.
 * Handles customer, subscription, and order events with idempotency and transaction safety.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);
  private readonly provider: string;
  private readonly enforce: boolean;
  private readonly logOnly: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly polarAdapter: PolarAdapter,
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {
    this.provider = this.configService.get<string>('BILLING_PROVIDER', 'polar');
    this.enforce =
      this.configService.get<string>('BILLING_ENFORCE', 'false') === 'true';
    this.logOnly =
      this.configService.get<string>('BILLING_LOG_ONLY', 'false') === 'true';

    this.logger.log(
      `BillingWebhookService initialized: provider=${this.provider}, enforce=${this.enforce}, logOnly=${this.logOnly}`,
    );
  }

  /**
   * Process a webhook event by eventId (idempotent).
   * @param eventId External event ID from billing provider
   * @returns Processed event status
   */
  async process(eventId: string): Promise<{
    status: string;
    processed: boolean;
  }> {
    // Find existing event
    const existingEvent = await this.prisma.billingEvent.findUnique({
      where: {
        provider_eventId: {
          provider: this.provider,
          eventId,
        },
      },
    });

    // Idempotency check: skip if already processed or failed
    if (existingEvent) {
      if (existingEvent.status === 'processed') {
        this.logger.log(
          `Event ${eventId} already processed, skipping (idempotency)`,
        );
        return {
          status: existingEvent.status,
          processed: false,
        };
      }

      if (existingEvent.status === 'failed') {
        this.logger.warn(
          `Event ${eventId} previously failed, skipping (idempotency)`,
        );
        return {
          status: existingEvent.status,
          processed: false,
        };
      }

      // Event is pending, process it
      this.logger.log(`Processing pending event ${eventId}`);
    } else {
      this.logger.error(
        `Event ${eventId} not found in database. Event must be persisted before processing.`,
      );
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const payload = existingEvent.payload as any;
    const eventType = existingEvent.type;

    try {
      // Process event based on type
      await this.handleEvent(eventType, payload);

      // Update event status to processed
      await this.prisma.billingEvent.update({
        where: {
          id: existingEvent.id,
        },
        data: {
          status: 'processed',
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Event ${eventId} processed successfully: type=${eventType}`,
      );

      return {
        status: 'processed',
        processed: true,
      };
    } catch (error: any) {
      this.logger.error(
        `Error processing event ${eventId}: ${error.message}`,
        error.stack,
      );

      // Update event status to failed
      await this.prisma.billingEvent.update({
        where: {
          id: existingEvent.id,
        },
        data: {
          status: 'failed',
          processedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Handle webhook event by type.
   * @param eventType Event type (e.g., 'customer.created', 'subscription.active')
   * @param payload Event payload
   */
  private async handleEvent(eventType: string, payload: any): Promise<void> {
    this.logger.log(`Handling event: type=${eventType}`);

    // Customer events
    if (eventType.startsWith('customer.')) {
      await this.handleCustomerEvent(eventType, payload);
      return;
    }

    // Subscription events
    if (eventType.startsWith('subscription.')) {
      await this.handleSubscriptionEvent(eventType, payload);
      return;
    }

    // Order events
    if (eventType.startsWith('order.')) {
      await this.handleOrderEvent(eventType, payload);
      return;
    }

    this.logger.warn(`Unhandled event type: ${eventType}, skipping`);
  }

  /**
   * Handle customer events.
   * @param eventType Event type (customer.created, customer.updated, customer.deleted, customer.state_changed)
   * @param payload Event payload
   */
  private async handleCustomerEvent(
    eventType: string,
    payload: any,
  ): Promise<void> {
    this.logger.log(
      `Processing customer event: type=${eventType}, provider=${this.provider}`,
    );

    const customerData = this.polarAdapter.extractCustomer(payload);

    switch (eventType) {
      case 'customer.created':
      case 'customer.updated':
      case 'customer.state_changed':
        await this.onCustomerUpsert(customerData);
        break;

      case 'customer.deleted':
        await this.onCustomerDeleted(customerData.externalCustomerId);
        break;

      default:
        this.logger.warn(`Unhandled customer event type: ${eventType}`);
    }
  }

  /**
   * Handle subscription events.
   * @param eventType Event type (subscription.created, subscription.updated, subscription.canceled, subscription.active, subscription.revoked, subscription.uncanceled)
   * @param payload Event payload
   */
  private async handleSubscriptionEvent(
    eventType: string,
    payload: any,
  ): Promise<void> {
    this.logger.log(
      `Processing subscription event: type=${eventType}, provider=${this.provider}`,
    );

    const subscriptionData = this.polarAdapter.extractSubscription(payload);

    switch (eventType) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.canceled':
      case 'subscription.active':
      case 'subscription.revoked':
      case 'subscription.uncanceled':
        await this.onSubscriptionChange(eventType, subscriptionData);
        break;

      default:
        this.logger.warn(`Unhandled subscription event type: ${eventType}`);
    }
  }

  /**
   * Handle order events.
   * @param eventType Event type (order.created, order.updated, order.paid, order.refunded)
   * @param payload Event payload
   */
  private async handleOrderEvent(
    eventType: string,
    payload: any,
  ): Promise<void> {
    this.logger.log(
      `Processing order event: type=${eventType}, provider=${this.provider}`,
    );

    // Order events are primarily for logging and reconciliation
    // They don't directly affect subscription status
    // Subscription status is managed via subscription events

    switch (eventType) {
      case 'order.created':
      case 'order.updated':
      case 'order.paid':
      case 'order.refunded':
        this.logger.log(
          `Order event received: type=${eventType}, order_id=${payload.data?.object?.id || payload.order?.id || 'unknown'}`,
        );
        // No action required for order events at this time
        // They can be used for reconciliation and analytics
        break;

      default:
        this.logger.warn(`Unhandled order event type: ${eventType}`);
    }
  }

  /**
   * Upsert billing customer from webhook event.
   * Links external customer to internal user ID via external_id or email/metadata.
   * @param customerData Customer data extracted from webhook payload
   */
  private async onCustomerUpsert(customerData: {
    externalCustomerId: string;
    email?: string;
    externalId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (this.logOnly) {
      this.logger.log(
        `[LOG_ONLY] Would upsert customer: ${customerData.externalCustomerId}`,
      );
      return;
    }

    if (!this.enforce) {
      this.logger.log(
        `[ENFORCE=false] Skipping customer upsert: ${customerData.externalCustomerId}`,
      );
      return;
    }

    this.logger.log(
      `Upserting billing customer: ${customerData.externalCustomerId}, external_id=${customerData.externalId}, email=${customerData.email}`,
    );

    // Try to find user by external_id first (preferred method)
    let userId: number | null = null;

    if (customerData.externalId) {
      try {
        userId = parseInt(customerData.externalId, 10);
        // Verify user exists
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        if (!user) {
          this.logger.warn(
            `User ${userId} not found for external_id ${customerData.externalId}`,
          );
          userId = null;
        }
      } catch {
        this.logger.warn(
          `Invalid external_id format: ${customerData.externalId}`,
        );
        userId = null;
      }
    }

    // Fallback: try to find user by email
    if (!userId && customerData.email) {
      const user = await this.prisma.user.findFirst({
        where: { email: customerData.email },
      });
      if (user) {
        userId = user.id;
        this.logger.log(
          `Found user by email: ${customerData.email} -> userId=${userId}`,
        );
      }
    }

    // Fallback: try to find user by metadata.userId
    if (!userId && customerData.metadata?.userId) {
      try {
        userId = parseInt(customerData.metadata.userId, 10);
        // Verify user exists
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        if (!user) {
          this.logger.warn(
            `User ${userId} not found for metadata.userId ${customerData.metadata.userId}`,
          );
          userId = null;
        }
      } catch {
        this.logger.warn(
          `Invalid metadata.userId format: ${customerData.metadata.userId}`,
        );
        userId = null;
      }
    }

    if (!userId) {
      this.logger.warn(
        `Cannot link customer ${customerData.externalCustomerId} to user: no external_id, email, or metadata.userId found`,
      );
      // Still create BillingCustomer record without userId for reconciliation
      // This allows manual linking later
    }

    // Upsert BillingCustomer
    await this.prisma.billingCustomer.upsert({
      where: {
        provider_externalCustomerId: {
          provider: this.provider,
          externalCustomerId: customerData.externalCustomerId,
        },
      },
      create: {
        userId: userId || 0, // Use 0 as placeholder if no user found (will need manual linking)
        provider: this.provider,
        externalCustomerId: customerData.externalCustomerId,
      },
      update: {
        // Only update userId if we found a valid user
        ...(userId ? { userId } : {}),
      },
    });

    this.logger.log(
      `Upserted billing customer: ${customerData.externalCustomerId}${userId ? ` -> userId=${userId}` : ' (no user linked)'}`,
    );
  }

  /**
   * Handle customer deletion (optional, for cleanup).
   * @param externalCustomerId External customer ID
   */
  private async onCustomerDeleted(externalCustomerId: string): Promise<void> {
    if (this.logOnly) {
      this.logger.log(
        `[LOG_ONLY] Would delete customer: ${externalCustomerId}`,
      );
      return;
    }

    if (!this.enforce) {
      this.logger.log(
        `[ENFORCE=false] Skipping customer deletion: ${externalCustomerId}`,
      );
      return;
    }

    this.logger.log(`Deleting billing customer: ${externalCustomerId}`);

    // Delete BillingCustomer (cascade will handle related subscriptions)
    await this.prisma.billingCustomer.deleteMany({
      where: {
        provider: this.provider,
        externalCustomerId,
      },
    });

    this.logger.log(`Deleted billing customer: ${externalCustomerId}`);
  }

  /**
   * Handle subscription change event.
   * Resolves plan from product ID, enforces single active subscription, and upserts UserSubscription.
   * @param eventType Event type (for status mapping)
   * @param subscriptionData Subscription data extracted from webhook payload
   */
  private async onSubscriptionChange(
    eventType: string,
    subscriptionData: {
      externalSubscriptionId: string;
      externalCustomerId: string;
      externalPriceId?: string;
      externalProductId?: string;
      status: string;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      cancelAtPeriodEnd: boolean;
      trialEnd?: Date;
    },
  ): Promise<void> {
    if (this.logOnly) {
      this.logger.log(
        `[LOG_ONLY] Would process subscription change: ${subscriptionData.externalSubscriptionId}, eventType=${eventType}`,
      );
      return;
    }

    if (!this.enforce) {
      this.logger.log(
        `[ENFORCE=false] Skipping subscription change: ${subscriptionData.externalSubscriptionId}`,
      );
      return;
    }

    this.logger.log(
      `Processing subscription change: ${subscriptionData.externalSubscriptionId}, eventType=${eventType}, status=${subscriptionData.status}`,
    );

    // Resolve plan from product ID (Polar uses product IDs)
    let planId: number;

    if (subscriptionData.externalProductId) {
      // Resolve plan from product ID
      const plan = await this.billingService.resolvePlanFromProduct(
        subscriptionData.externalProductId,
      );
      planId = plan.planId;
    } else if (subscriptionData.externalPriceId) {
      // Fallback: try to resolve from price ID (for backward compatibility)
      // Note: This may not work if Polar only uses product IDs
      this.logger.warn(
        `Subscription ${subscriptionData.externalSubscriptionId} has price_id but no product_id. Attempting to resolve from price_id.`,
      );
      try {
        const planPrice = await this.prisma.planPrice.findUnique({
          where: {
            provider_externalPriceId: {
              provider: this.provider,
              externalPriceId: subscriptionData.externalPriceId,
            },
          },
          include: {
            plan: true,
          },
        });

        if (!planPrice) {
          throw new NotFoundException(
            `Plan not found for price ID: ${subscriptionData.externalPriceId}`,
          );
        }

        planId = planPrice.planId;
      } catch (error) {
        this.logger.error(
          `Failed to resolve plan from price ID: ${subscriptionData.externalPriceId}`,
          error,
        );
        throw error;
      }
    } else {
      throw new BadRequestException(
        `Subscription ${subscriptionData.externalSubscriptionId} has no product_id or price_id`,
      );
    }

    // Find billing customer to get userId
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: {
        provider_externalCustomerId: {
          provider: this.provider,
          externalCustomerId: subscriptionData.externalCustomerId,
        },
      },
    });

    if (!billingCustomer) {
      this.logger.error(
        `Billing customer not found: ${subscriptionData.externalCustomerId}`,
      );
      throw new NotFoundException(
        `Billing customer not found: ${subscriptionData.externalCustomerId}`,
      );
    }

    if (!billingCustomer.userId || billingCustomer.userId === 0) {
      this.logger.error(
        `Billing customer ${subscriptionData.externalCustomerId} has no linked user`,
      );
      throw new BadRequestException(
        `Billing customer ${subscriptionData.externalCustomerId} has no linked user`,
      );
    }

    const userId = billingCustomer.userId;

    // Map Polar status to internal status
    const internalStatus = this.mapSubscriptionStatus(
      eventType,
      subscriptionData.status,
    );

    // Use transaction to enforce single active/trialing subscription
    await this.prisma.$transaction(async (tx) => {
      // If this subscription is becoming active or trialing, cancel other active/trialing subscriptions
      if (internalStatus === 'active' || internalStatus === 'trialing') {
        // Find all other active/trialing subscriptions for this user
        const otherSubscriptions = await tx.userSubscription.findMany({
          where: {
            userId,
            provider: this.provider,
            status: {
              in: ['active', 'trialing'],
            },
            // Exclude current subscription
            NOT: {
              externalSubscriptionId: subscriptionData.externalSubscriptionId,
            },
          },
        });

        if (otherSubscriptions.length > 0) {
          await tx.userSubscription.updateMany({
            where: {
              id: {
                in: otherSubscriptions.map((s) => s.id),
              },
            },
            data: {
              status: 'canceled',
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            },
          });

          this.logger.log(
            `Canceled ${otherSubscriptions.length} other active/trialing subscription(s) for user ${userId}`,
          );
        }
      }

      // Upsert UserSubscription (findFirst + update/create since no unique constraint)
      const existingSubscription = await tx.userSubscription.findFirst({
        where: {
          provider: this.provider,
          externalSubscriptionId: subscriptionData.externalSubscriptionId,
        },
      });

      if (existingSubscription) {
        await tx.userSubscription.update({
          where: {
            id: existingSubscription.id,
          },
          data: {
            planId,
            status: internalStatus,
            currentPeriodStart: subscriptionData.currentPeriodStart,
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            trialEnd: subscriptionData.trialEnd,
            cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.userSubscription.create({
          data: {
            userId,
            planId,
            provider: this.provider,
            externalSubscriptionId: subscriptionData.externalSubscriptionId,
            status: internalStatus,
            currentPeriodStart: subscriptionData.currentPeriodStart,
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            trialEnd: subscriptionData.trialEnd,
            cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
          },
        });
      }

      this.logger.log(
        `Upserted subscription: ${subscriptionData.externalSubscriptionId} -> userId=${userId}, planId=${planId}, status=${internalStatus}`,
      );
    });
  }

  /**
   * Map Polar subscription status to internal status.
   * Handles event types: subscription.active, subscription.revoked, subscription.uncanceled.
   * Removes past_due status (not used in Polar).
   * @param eventType Event type (e.g., 'subscription.active')
   * @param polarStatus Polar status from webhook payload
   * @returns Internal status ('active'|'trialing'|'canceled')
   */
  private mapSubscriptionStatus(
    eventType: string,
    polarStatus: string,
  ): 'active' | 'trialing' | 'canceled' {
    // Handle event-specific status changes
    if (eventType === 'subscription.active') {
      return 'active';
    }

    if (eventType === 'subscription.revoked') {
      return 'canceled';
    }

    if (eventType === 'subscription.uncanceled') {
      return 'active';
    }

    // Map Polar status to internal status
    const statusLower = polarStatus.toLowerCase();

    if (statusLower === 'active') {
      return 'active';
    }

    if (statusLower === 'trialing' || statusLower === 'trial') {
      return 'trialing';
    }

    if (
      statusLower === 'canceled' ||
      statusLower === 'cancelled' ||
      statusLower === 'incomplete' ||
      statusLower === 'incomplete_expired' ||
      statusLower === 'unpaid'
    ) {
      return 'canceled';
    }

    // Default to canceled for unknown statuses
    this.logger.warn(
      `Unknown subscription status: ${polarStatus}, defaulting to canceled`,
    );
    return 'canceled';
  }
}
