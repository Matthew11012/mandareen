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

    // Checkout events
    if (eventType.startsWith('checkout.')) {
      await this.handleCheckoutEvent(eventType);
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
    try {
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
    } catch (error: any) {
      this.logger.error(
        `Error processing customer event: ${error.message}`,
        error.stack,
      );
      throw error;
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
    try {
      const subscriptionData = this.polarAdapter.extractSubscription(payload);

      switch (eventType) {
        case 'subscription.created':
        case 'subscription.updated':
        case 'subscription.canceled':
        case 'subscription.active':
        case 'subscription.revoked':
        case 'subscription.uncanceled':
          await this.onSubscriptionChange(eventType, subscriptionData, payload);
          break;

        default:
          this.logger.warn(`Unhandled subscription event type: ${eventType}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error processing subscription event: ${error.message}`,
        error.stack,
      );
      throw error;
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
    // Order events are primarily for logging and reconciliation
    // They don't directly affect subscription status
    // Subscription status is managed via subscription events

    const order = payload.data;
    if (!order) {
      this.logger.warn(`Order event ${eventType} has no data payload`);
      return;
    }

    switch (eventType) {
      case 'order.created':
      case 'order.updated':
      case 'order.paid':
      case 'order.refunded':
        // No action required for order events at this time
        // They can be used for reconciliation and analytics
        break;

      default:
        this.logger.warn(`Unhandled order event type: ${eventType}`);
    }
  }

  /**
   * Handle checkout events.
   * @param eventType Event type (checkout.created, checkout.updated, checkout.completed, checkout.expired)
   */
  private async handleCheckoutEvent(eventType: string): Promise<void> {
    // Checkout events are primarily for logging and tracking checkout flow
    // Customer and subscription creation are handled by their respective events

    switch (eventType) {
      case 'checkout.created':
      case 'checkout.updated':
      case 'checkout.completed':
      case 'checkout.expired':
        // No action required for checkout events at this time
        // They can be used for tracking checkout flow and analytics
        break;

      default:
        this.logger.warn(`Unhandled checkout event type: ${eventType}`);
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
      return;
    }

    if (!this.enforce) {
      return;
    }

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
  }

  /**
   * Handle customer deletion (optional, for cleanup).
   * @param externalCustomerId External customer ID
   */
  private async onCustomerDeleted(externalCustomerId: string): Promise<void> {
    if (!externalCustomerId) {
      this.logger.error(
        'Cannot delete customer: externalCustomerId is missing or undefined',
      );
      return;
    }

    if (this.logOnly || !this.enforce) {
      return;
    }

    // Delete BillingCustomer (cascade will handle related subscriptions)
    await this.prisma.billingCustomer.deleteMany({
      where: {
        provider: this.provider,
        externalCustomerId,
      },
    });
  }

  /**
   * Handle subscription change event.
   * Resolves plan from product ID, enforces single active subscription, and upserts UserSubscription.
   * @param eventType Event type (for status mapping)
   * @param subscriptionData Subscription data extracted from webhook payload
   * @param payload Original webhook payload (for extracting customer info if needed)
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
    payload?: any,
  ): Promise<void> {
    if (this.logOnly || !this.enforce) {
      return;
    }

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
    let billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: {
        provider_externalCustomerId: {
          provider: this.provider,
          externalCustomerId: subscriptionData.externalCustomerId,
        },
      },
    });

    // If billing customer doesn't exist, try to create it from subscription payload
    if (!billingCustomer && payload) {
      this.logger.warn(
        `Billing customer not found: ${subscriptionData.externalCustomerId}. Attempting to create from subscription payload.`,
      );

      try {
        // Extract customer info from subscription payload
        // Polar subscription payload structure: { type: "...", data: { customer_id: "...", customer: {...}, metadata: {...} } }
        const subscription = payload.data;
        const customer = subscription?.customer;
        const metadata = subscription?.metadata || {};

        let userId: number | null = null;

        // Try to find user by customer.external_id first (most reliable)
        if (customer?.external_id) {
          try {
            userId = parseInt(customer.external_id, 10);
            if (!isNaN(userId)) {
              const user = await this.prisma.user.findUnique({
                where: { id: userId },
              });
              if (!user) {
                this.logger.warn(
                  `User ${userId} not found for external_id ${customer.external_id}`,
                );
                userId = null;
              }
            }
          } catch (e) {
            this.logger.warn(
              `Invalid external_id format: ${customer.external_id}, error: ${e}`,
            );
            userId = null;
          }
        }

        // Fallback: try to find user by metadata.userId
        if (!userId && metadata.userId) {
          try {
            userId = parseInt(metadata.userId, 10);
            if (!isNaN(userId)) {
              const user = await this.prisma.user.findUnique({
                where: { id: userId },
              });
              if (!user) {
                this.logger.warn(
                  `User ${userId} not found for metadata.userId ${metadata.userId}`,
                );
                userId = null;
              }
            }
          } catch (e) {
            this.logger.warn(
              `Invalid metadata.userId format: ${metadata.userId}, error: ${e}`,
            );
            userId = null;
          }
        }

        // Fallback: try to find user by email
        if (!userId && customer?.email) {
          const user = await this.prisma.user.findFirst({
            where: { email: customer.email },
          });
          if (user) {
            userId = user.id;
          } else {
            this.logger.warn(`User not found for email: ${customer.email}`);
          }
        }

        // Create billing customer (even if we can't link to user)
        billingCustomer = await this.prisma.billingCustomer.upsert({
          where: {
            provider_externalCustomerId: {
              provider: this.provider,
              externalCustomerId: subscriptionData.externalCustomerId,
            },
          },
          create: {
            userId: userId || 0, // Use 0 as placeholder if no user found
            provider: this.provider,
            externalCustomerId: subscriptionData.externalCustomerId,
          },
          update: {
            // Only update userId if we found a valid user
            ...(userId ? { userId } : {}),
          },
        });
      } catch (error: any) {
        this.logger.error(
          `Failed to create billing customer from subscription payload: ${error.message}`,
        );
        // Continue with error - we'll throw below if customer still doesn't exist
      }
    }

    // If billing customer still doesn't exist, throw error
    if (!billingCustomer) {
      this.logger.error(
        `Billing customer not found: ${subscriptionData.externalCustomerId}. Cannot process subscription without customer record.`,
      );
      throw new NotFoundException(
        `Billing customer not found: ${subscriptionData.externalCustomerId}. Subscription events require a customer record.`,
      );
    }

    // Check if customer is linked to a user
    if (!billingCustomer.userId || billingCustomer.userId === 0) {
      this.logger.warn(
        `Billing customer ${subscriptionData.externalCustomerId} has no linked user. Subscription will be created but not associated with any user.`,
      );
      // For now, we'll skip creating the subscription if no user is linked
      // In the future, we could create a placeholder or queue it for manual linking
      throw new BadRequestException(
        `Billing customer ${subscriptionData.externalCustomerId} has no linked user. Cannot create subscription without user association.`,
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
