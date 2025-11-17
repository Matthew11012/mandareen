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
  private readonly prisma: PrismaService;
  private readonly logger = new Logger(UsageService.name);
  private readonly windowDays: number;
  private readonly enforceUsage: boolean;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
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
    } = args;

    await this.ensureWithinQuota(args);
    await this.recordUsage(
      {
        userId,
        resource,
        amount,
        idempotencyKey,
        now,
      },
      { logContext: 'usage' },
    );
  }

  /**
   * Lightweight quota check without recording usage.
   * Used when consumption is deferred until after a long-running operation succeeds.
   */
  async ensureWithinQuota(args: CheckAndConsumeArgs): Promise<void> {
    const {
      userId,
      resource,
      amount,
      idempotencyKey,
      now = new Date(),
      planCap,
      windowDays = this.windowDays,
    } = args;

    if (idempotencyKey) {
      const hasDuplicate = await this.hasRecentIdempotentEvent(
        userId,
        resource,
        idempotencyKey,
        now,
      );
      if (hasDuplicate) {
        this.logger.debug(
          `Idempotency key ${idempotencyKey} already recorded for user ${userId}, resource ${resource}. Skipping quota check.`,
        );
        return;
      }
    }

    const used = await this.sumUsedLastNDays(userId, resource, windowDays);
    const wouldExceed = used + amount > planCap;

    if (!this.enforceUsage) {
      this.logger.log(
        `[LOG-ONLY] Usage check for user ${userId}, resource ${resource}: used=${used}, amount=${amount}, planCap=${planCap}, wouldExceed=${wouldExceed}`,
      );
      return;
    }

    if (wouldExceed) {
      this.logger.warn(
        `Quota exceeded for user ${userId}, resource ${resource}: used=${used}, amount=${amount}, planCap=${planCap}`,
      );
      throw new QuotaExceededError(resource, planCap, used);
    }
  }

  /**
   * Explicit consumption step – records usage after a successful operation.
   */
  async recordUsage(
    args: RecordAnalyticsArgs,
    options?: { logContext?: string },
  ): Promise<void> {
    await this.recordUsageWithIdempotency(args, options?.logContext ?? 'usage');
  }

  /**
   * Record usage analytics without quota enforcement.
   * Useful for tracking resources that don't have caps.
   */
  async recordAnalytics(args: RecordAnalyticsArgs): Promise<void> {
    await this.recordUsageWithIdempotency(args, 'analytics');
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

  private async recordUsageWithIdempotency(
    args: RecordAnalyticsArgs,
    logContext: string,
  ): Promise<void> {
    const {
      userId,
      resource,
      amount,
      idempotencyKey,
      now = new Date(),
      metadata,
    } = args;

    if (idempotencyKey) {
      const hasDuplicate = await this.hasRecentIdempotentEvent(
        userId,
        resource,
        idempotencyKey,
        now,
      );
      if (hasDuplicate) {
        this.logger.debug(
          `Idempotency key ${idempotencyKey} already recorded for ${logContext}. Skipping.`,
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

  private async hasRecentIdempotentEvent(
    userId: number,
    resource: string,
    idempotencyKey: string,
    now: Date,
  ): Promise<boolean> {
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
      take: 100,
    });

    return recentEvents.some((event) => {
      if (!event.metadata || typeof event.metadata !== 'object') {
        return false;
      }
      const metadata = event.metadata as any;
      return metadata.idempotencyKey === idempotencyKey;
    });
  }

  /**
   * Get usage summary for all resources in a user's plan.
   * Efficiently aggregates UsageDaily records in a single query.
   *
   * Performance characteristics:
   * - Single database query using groupBy aggregation
   * - Leverages UsageDaily pre-aggregated data (not raw events)
   * - Scales well: O(1) query regardless of event volume
   *
   * @param userId User ID
   * @param windowDays Rolling window size (defaults to service windowDays)
   * @returns Map of resource -> used amount for the rolling window
   */
  async getUsageSummaryByResource(
    userId: number,
    options?: {
      start?: Date;
      end?: Date;
      windowDays?: number;
    },
  ): Promise<Map<string, number>> {
    const windowDays = options?.windowDays ?? this.windowDays;

    let windowStart: Date;
    if (options?.start) {
      windowStart = new Date(options.start);
    } else {
      windowStart = new Date();
      windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
    }
    windowStart.setUTCHours(0, 0, 0, 0);

    let windowEnd: Date | undefined;
    if (options?.end) {
      windowEnd = new Date(options.end);
      windowEnd.setUTCHours(0, 0, 0, 0);
    }

    const dayFilter: {
      gte: Date;
      lt?: Date;
    } = {
      gte: windowStart,
    };
    if (windowEnd && windowEnd.getTime() > windowStart.getTime()) {
      dayFilter.lt = windowEnd;
    }

    // Single efficient query: group by resource and sum usage
    // This is much faster than N queries (one per resource)
    const results = await this.prisma.usageDaily.groupBy({
      by: ['resource'],
      where: {
        userId,
        day: dayFilter,
      },
      _sum: {
        used: true,
      },
    });

    // Convert to Map for O(1) lookup
    const usageMap = new Map<string, number>();
    for (const result of results) {
      usageMap.set(result.resource, result._sum.used || 0);
    }

    return usageMap;
  }

  /**
   * Calculate reset timestamps for all resources in a single efficient query.
   * The window resets when the oldest entry falls outside the window.
   *
   * Performance: Single query instead of N queries (one per resource).
   *
   * @param userId User ID
   * @param resources Array of resource names to calculate resets for
   * @param windowDays Rolling window size
   * @returns Map of resource -> ISO 8601 reset timestamp
   */
  async getWindowResetsAt(
    userId: number,
    resources: string[],
    options?: {
      start?: Date;
      end?: Date;
      windowDays?: number;
    },
  ): Promise<Map<string, string>> {
    const windowDays = options?.windowDays ?? this.windowDays;

    if (resources.length === 0) {
      return new Map<string, string>();
    }

    let windowStart: Date;
    if (options?.start) {
      windowStart = new Date(options.start);
    } else {
      windowStart = new Date();
      windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
    }
    windowStart.setUTCHours(0, 0, 0, 0);

    if (options?.end) {
      const windowEnd = new Date(options.end);
      windowEnd.setUTCHours(0, 0, 0, 0);
      const iso = windowEnd.toISOString();
      const resetMap = new Map<string, string>();
      for (const resource of resources) {
        resetMap.set(resource, iso);
      }
      return resetMap;
    }

    // Single query: get all UsageDaily records for user in window
    // Then find min(day) per resource in memory
    const records = await this.prisma.usageDaily.findMany({
      where: {
        userId,
        resource: {
          in: resources,
        },
        day: {
          gte: windowStart,
        },
      },
      select: {
        resource: true,
        day: true,
      },
      orderBy: {
        day: 'asc',
      },
    });

    // Group by resource and find minimum day for each
    const minDayByResource = new Map<string, Date>();
    for (const record of records) {
      const existing = minDayByResource.get(record.resource);
      if (!existing || record.day < existing) {
        minDayByResource.set(record.resource, record.day);
      }
    }

    // Calculate reset timestamps
    const resetMap = new Map<string, string>();
    const defaultReset = new Date(windowStart);
    defaultReset.setUTCDate(defaultReset.getUTCDate() + windowDays);
    defaultReset.setUTCHours(0, 0, 0, 0);

    for (const resource of resources) {
      const minDay = minDayByResource.get(resource);
      if (!minDay) {
        // No usage yet, window resets at (windowStart + windowDays)
        resetMap.set(resource, defaultReset.toISOString());
      } else {
        // Window resets when oldest entry falls outside: minDay + windowDays
        const resetAt = new Date(minDay);
        resetAt.setUTCDate(resetAt.getUTCDate() + windowDays);
        resetAt.setUTCHours(0, 0, 0, 0);
        resetMap.set(resource, resetAt.toISOString());
      }
    }

    return resetMap;
  }

  /**
   * Calculate the reset timestamp for a single resource (legacy method for compatibility).
   * Prefer getWindowResetsAt for batch operations.
   *
   * @param userId User ID
   * @param resource Resource name
   * @param windowDays Rolling window size
   * @returns ISO 8601 timestamp when the window resets
   */
  async getWindowResetAt(
    userId: number,
    resource: string,
    options?: {
      start?: Date;
      end?: Date;
      windowDays?: number;
    },
  ): Promise<string> {
    const resetMap = await this.getWindowResetsAt(userId, [resource], options);
    return resetMap.get(resource) || new Date().toISOString();
  }
}
