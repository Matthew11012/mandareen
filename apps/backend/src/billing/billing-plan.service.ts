import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CachedPlan {
  plan: {
    id: number;
    code: string;
    name: string;
    description: string | null;
    periodUnit: string;
    displayPriceCents: number;
    currency: string;
    isActive: boolean;
  };
  limits: Array<{
    id: number;
    planId: number;
    resource: string;
    monthlyCap: number;
    rpm: number | null;
    burst: number | null;
    concurrency: number | null;
  }>;
  cachedAt: number; // timestamp
}

/**
 * Service for resolving user billing plans and limits.
 * Caches plan+limits in memory for 5 minutes to reduce DB pressure.
 */
@Injectable()
export class BillingPlanService {
  private readonly logger = new Logger(BillingPlanService.name);
  private readonly cache = new Map<number, CachedPlan>();
  private readonly cacheTtlSeconds: number;

  constructor(private readonly prisma: PrismaService) {
    this.cacheTtlSeconds = Number(process.env.PLAN_CACHE_TTL_SECONDS) || 300; // 5 minutes default
  }

  /**
   * Get the active plan and all limits for a user.
   * Resolves active subscription, or falls back to FREE plan.
   * Caches result for PLAN_CACHE_TTL_SECONDS.
   */
  async getUserPlan(userId: number): Promise<{
    plan: {
      id: number;
      code: string;
      name: string;
      description: string | null;
      periodUnit: string;
      displayPriceCents: number;
      currency: string;
      isActive: boolean;
    };
    limits: Array<{
      id: number;
      planId: number;
      resource: string;
      monthlyCap: number;
      rpm: number | null;
      burst: number | null;
      concurrency: number | null;
    }>;
  }> {
    // Check cache
    const cached = this.cache.get(userId);
    const now = Date.now();
    if (cached && now - cached.cachedAt < this.cacheTtlSeconds * 1000) {
      return { plan: cached.plan, limits: cached.limits };
    }

    // Resolve plan from active subscription or FREE fallback
    let planId: number | null = null;

    // Check for active subscription
    const activeSubscription = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: 'active',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        plan: true,
      },
    });

    if (activeSubscription) {
      planId = activeSubscription.planId;
      this.logger.debug(
        `User ${userId} has active subscription to plan ${activeSubscription.plan.code}`,
      );
    } else {
      // Fallback to FREE plan
      const freePlan = await this.prisma.plan.findUnique({
        where: { code: 'FREE' },
      });

      if (!freePlan) {
        this.logger.error(
          'FREE plan not found in database. Ensure seed script has been run.',
        );
        // Return conservative default (no limits = unlimited)
        return {
          plan: {
            id: 0,
            code: 'FREE',
            name: 'Free',
            description: 'Default free plan',
            periodUnit: 'monthly',
            displayPriceCents: 0,
            currency: 'USD',
            isActive: true,
          },
          limits: [],
        };
      }

      planId = freePlan.id;
      this.logger.debug(
        `User ${userId} using FREE plan (no active subscription)`,
      );
    }

    // Fetch plan with limits
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: {
        limits: true,
      },
    });

    if (!plan) {
      this.logger.error(`Plan ${planId} not found for user ${userId}`);
      // Return FREE fallback
      const freePlan = await this.prisma.plan.findUnique({
        where: { code: 'FREE' },
        include: {
          limits: true,
        },
      });

      if (!freePlan) {
        return {
          plan: {
            id: 0,
            code: 'FREE',
            name: 'Free',
            description: 'Default free plan',
            periodUnit: 'monthly',
            displayPriceCents: 0,
            currency: 'USD',
            isActive: true,
          },
          limits: [],
        };
      }

      const result = {
        plan: {
          id: freePlan.id,
          code: freePlan.code,
          name: freePlan.name,
          description: freePlan.description,
          periodUnit: freePlan.periodUnit,
          displayPriceCents: freePlan.displayPriceCents,
          currency: freePlan.currency,
          isActive: freePlan.isActive,
        },
        limits: freePlan.limits.map((l) => ({
          id: l.id,
          planId: l.planId,
          resource: l.resource,
          monthlyCap: l.monthlyCap,
          rpm: l.rpm,
          burst: l.burst,
          concurrency: l.concurrency,
        })),
      };

      // Cache result
      this.cache.set(userId, {
        ...result,
        cachedAt: now,
      });

      return result;
    }

    const result = {
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        periodUnit: plan.periodUnit,
        displayPriceCents: plan.displayPriceCents,
        currency: plan.currency,
        isActive: plan.isActive,
      },
      limits: plan.limits.map((l) => ({
        id: l.id,
        planId: l.planId,
        resource: l.resource,
        monthlyCap: l.monthlyCap,
        rpm: l.rpm,
        burst: l.burst,
        concurrency: l.concurrency,
      })),
    };

    // Cache result
    this.cache.set(userId, {
      ...result,
      cachedAt: now,
    });

    return result;
  }

  /**
   * Get a specific limit for a user and resource.
   * Returns null if limit not found.
   */
  async getLimit(
    userId: number,
    resource: string,
  ): Promise<{
    id: number;
    planId: number;
    resource: string;
    monthlyCap: number;
    rpm: number | null;
    burst: number | null;
    concurrency: number | null;
  } | null> {
    const { limits } = await this.getUserPlan(userId);
    return limits.find((l) => l.resource === resource) || null;
  }

  /**
   * Clear cache for a user (useful after subscription changes).
   */
  clearCache(userId: number): void {
    this.cache.delete(userId);
    this.logger.debug(`Cleared plan cache for user ${userId}`);
  }

  /**
   * Clear all cache (useful for testing or cache invalidation).
   */
  clearAllCache(): void {
    this.cache.clear();
    this.logger.debug('Cleared all plan cache');
  }
}
