import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaExceededError } from './errors/billing.errors';

interface CheckAndConsumeArgs {
  userId: number;
  resource: string;
  amount: number;
  idempotencyKey?: string;
  now?: Date;
  planCap: number;
  windowDays?: number; // Optional, defaults to service's windowDays
}

interface RecordAnalyticsArgs {
  userId: number;
  resource: string;
  amount: number;
  idempotencyKey?: string;
  now?: Date;
  metadata?: any;
}

/**
 * Service for usage metering and quota enforcement.
 * Implements rolling 30-day windows with idempotency support.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private readonly windowDays: number;
  private readonly enforceUsage: boolean;

  constructor(private readonly prisma: PrismaService) {
    this.windowDays = Number(process.env.USAGE_WINDOW_DAYS) || 30;
    this.enforceUsage = process.env.USAGE_ENFORCE === 'true';
  }

  /**
   * Sum usage for a user and resource over the last N days.
   * Uses UsageDaily aggregates for efficient computation.
   */
  async sumUsedLastNDays(
    userId: number,
    resource: string,
    nDays: number = this.windowDays,
  ): Promise<number> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - nDays);
    cutoff.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.usageDaily.aggregate({
      where: {
        userId,
        resource,
        day: {
          gte: cutoff,
        },
      },
      _sum: {
        used: true,
      },
    });

    return result._sum.used || 0;
  }

  /**
   * Check if usage would exceed quota, then record it.
   * Throws QuotaExceededError if quota would be exceeded.
   * Uses idempotency keys to prevent double-counting.
   *
   * In log-only mode (USAGE_ENFORCE=false), computes and logs but does not throw.
   */
  async checkAndConsume(args: CheckAndConsumeArgs): Promise<void> {
    const {
      userId,
      resource,
      amount,
      idempotencyKey,
      now = new Date(),
      planCap,
      windowDays = this.windowDays,
    } = args;

    // Check idempotency if key provided
    // Look for events in the last 24 hours with matching idempotency key
    if (idempotencyKey) {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentEvents = await this.prisma.usageEvent.findMany({
        where: {
          userId,
          resource,
          occurredAt: {
            gte: oneDayAgo,
          },
        },
        select: {
          metadata: true,
        },
        take: 100, // Limit to recent events for performance
      });

      // Check metadata for idempotency key (simpler than JSON path queries)
      const hasDuplicate = recentEvents.some((event) => {
        if (!event.metadata || typeof event.metadata !== 'object') {
          return false;
        }
        const metadata = event.metadata as any;
        return metadata.idempotencyKey === idempotencyKey;
      });

      if (hasDuplicate) {
        this.logger.debug(
          `Idempotency key ${idempotencyKey} already recorded for user ${userId}, resource ${resource}. Skipping.`,
        );
        return; // Already recorded, no-op
      }
    }

    // Compute current usage
    const used = await this.sumUsedLastNDays(userId, resource, windowDays);
    const wouldExceed = used + amount > planCap;

    // Log-only mode: compute and log but don't throw
    if (!this.enforceUsage) {
      this.logger.log(
        `[LOG-ONLY] Usage check for user ${userId}, resource ${resource}: used=${used}, amount=${amount}, planCap=${planCap}, wouldExceed=${wouldExceed}`,
      );
      // Still record usage even in log-only mode for analytics
      await this.recordUsageInternal(
        userId,
        resource,
        amount,
        idempotencyKey,
        now,
      );
      return;
    }

    // Enforce mode: throw if quota exceeded
    if (wouldExceed) {
      this.logger.warn(
        `Quota exceeded for user ${userId}, resource ${resource}: used=${used}, amount=${amount}, planCap=${planCap}`,
      );
      throw new QuotaExceededError(resource, planCap, used);
    }

    // Record usage within transaction for race safety
    await this.recordUsageInternal(
      userId,
      resource,
      amount,
      idempotencyKey,
      now,
    );

    this.logger.debug(
      `Recorded usage for user ${userId}, resource ${resource}: amount=${amount}, newTotal=${used + amount}`,
    );
  }

  /**
   * Record usage analytics without quota enforcement.
   * Useful for tracking resources that don't have caps.
   */
  async recordAnalytics(args: RecordAnalyticsArgs): Promise<void> {
    const {
      userId,
      resource,
      amount,
      idempotencyKey,
      now = new Date(),
      metadata,
    } = args;

    // Check idempotency if key provided
    // Look for events in the last 24 hours with matching idempotency key
    if (idempotencyKey) {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentEvents = await this.prisma.usageEvent.findMany({
        where: {
          userId,
          resource,
          occurredAt: {
            gte: oneDayAgo,
          },
        },
        select: {
          metadata: true,
        },
        take: 100, // Limit to recent events for performance
      });

      // Check metadata for idempotency key
      const hasDuplicate = recentEvents.some((event) => {
        if (!event.metadata || typeof event.metadata !== 'object') {
          return false;
        }
        const metadata = event.metadata as any;
        return metadata.idempotencyKey === idempotencyKey;
      });

      if (hasDuplicate) {
        this.logger.debug(
          `Idempotency key ${idempotencyKey} already recorded for analytics. Skipping.`,
        );
        return;
      }
    }

    await this.recordUsageInternal(
      userId,
      resource,
      amount,
      idempotencyKey,
      now,
      metadata,
    );
  }

  /**
   * Internal method to record usage in a transaction.
   * Upserts UsageDaily aggregate and inserts UsageEvent.
   */
  private async recordUsageInternal(
    userId: number,
    resource: string,
    amount: number,
    idempotencyKey?: string,
    now: Date = new Date(),
    metadata?: any,
  ): Promise<void> {
    // Use transaction for race safety
    await this.prisma.$transaction(async (tx) => {
      // Get UTC midnight for the day
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);

      // Prepare metadata with idempotency key
      const eventMetadata: any = metadata || {};
      if (idempotencyKey) {
        eventMetadata.idempotencyKey = idempotencyKey;
      }

      // Insert UsageEvent
      await tx.usageEvent.create({
        data: {
          userId,
          resource,
          delta: amount,
          occurredAt: now,
          metadata: eventMetadata,
        },
      });

      // Upsert UsageDaily aggregate
      // Use findFirst to check for existing record (more defensive than findUnique)
      const existing = await tx.usageDaily.findFirst({
        where: {
          userId,
          resource,
          day,
        },
      });

      if (existing) {
        await tx.usageDaily.update({
          where: {
            id: existing.id,
          },
          data: {
            used: {
              increment: amount,
            },
          },
        });
      } else {
        await tx.usageDaily.create({
          data: {
            userId,
            resource,
            day,
            used: amount,
          },
        });
      }
    });
  }
}
