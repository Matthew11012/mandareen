import {
  Controller,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { UsageService } from './usage.service';
import { BillingPlanService } from './billing-plan.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { UsageSummaryDto } from './dto/usage-summary.dto';
import { BILLING_RESOURCES } from './billing-resources.constants';

const OMITTED_USAGE_RESOURCES = new Set<string>([
  BILLING_RESOURCES.CONVO_MESSAGE_TEXT,
  BILLING_RESOURCES.CONVO_MESSAGE_AUDIO,
]);

/**
 * Usage controller for retrieving usage summaries.
 * Provides endpoints for querying rolling window usage data.
 */
@Controller('usage')
@UseGuards(AuthGuard)
export class UsageController {
  private readonly usageService: UsageService;
  private readonly billingPlanService: BillingPlanService;
  private readonly prisma: PrismaService;

  constructor(
    usageService: UsageService,
    billingPlanService: BillingPlanService,
    prisma: PrismaService,
  ) {
    this.usageService = usageService;
    this.billingPlanService = billingPlanService;
    this.prisma = prisma;
  }

  /**
   * Calculate the current billing month window for monthly subscriptions.
   * For monthly plans, usage is aggregated per billing month (e.g., Nov 9 - Dec 9, Dec 9 - Jan 9).
   *
   * @param periodStart Subscription period start date
   * @param now Current date (defaults to now)
   * @returns Object with windowStart and windowEnd for the current billing month
   */
  private calculateCurrentBillingMonth(
    periodStart: Date,
    now: Date = new Date(),
  ): { windowStart: Date; windowEnd: Date } {
    const start = new Date(periodStart);
    start.setUTCHours(0, 0, 0, 0);

    const nowUtc = new Date(now);
    nowUtc.setUTCHours(0, 0, 0, 0);

    // Get the day of month from the subscription start (e.g., 9th)
    const startDay = start.getUTCDate();

    // Find which billing month we're currently in
    // Start from the subscription start and find the billing month that contains "now"
    let currentWindowStart = new Date(start);
    currentWindowStart.setUTCHours(0, 0, 0, 0);

    // Calculate the start of the current billing month
    // We need to find the most recent billing month start that is <= now
    const currentYear = nowUtc.getUTCFullYear();
    const currentMonth = nowUtc.getUTCMonth();
    const currentDay = nowUtc.getUTCDate();

    // Try the current month first
    currentWindowStart = new Date(
      Date.UTC(currentYear, currentMonth, startDay, 0, 0, 0, 0),
    );

    // If today is before the start day of this month, we're in the previous billing month
    if (currentDay < startDay) {
      // Move to previous month
      if (currentMonth === 0) {
        currentWindowStart = new Date(
          Date.UTC(currentYear - 1, 11, startDay, 0, 0, 0, 0),
        );
      } else {
        currentWindowStart = new Date(
          Date.UTC(currentYear, currentMonth - 1, startDay, 0, 0, 0, 0),
        );
      }
    }

    // Ensure we don't go before the subscription start
    if (currentWindowStart < start) {
      currentWindowStart = new Date(start);
    }

    // Calculate the end of the current billing month (start of next billing month)
    const currentWindowEnd = new Date(currentWindowStart);
    if (currentWindowEnd.getUTCMonth() === 11) {
      currentWindowEnd.setUTCFullYear(currentWindowEnd.getUTCFullYear() + 1);
      currentWindowEnd.setUTCMonth(0);
    } else {
      currentWindowEnd.setUTCMonth(currentWindowEnd.getUTCMonth() + 1);
    }
    currentWindowEnd.setUTCHours(0, 0, 0, 0);

    return {
      windowStart: currentWindowStart,
      windowEnd: currentWindowEnd,
    };
  }

  /**
   * Get usage summary for the authenticated user.
   * Returns usage data for all resources in the user's plan.
   *
   * Window calculation:
   * - For monthly subscriptions: aggregates current billing month (e.g., Nov 9 - Dec 9)
   *   Monthly limits apply to the current billing month only
   * - For longer subscriptions (6-month, yearly): aggregates full period
   * - For FREE plan: aggregates current billing month based on account creation date
   *   (e.g., if account created Nov 9, then Nov 9 - Dec 9, Dec 9 - Jan 9, etc.)
   *
   * Performance:
   * - Uses efficient UsageDaily aggregation (single groupBy query)
   * - Leverages BillingPlanService cache (5min TTL)
   * - Scales well with large event volumes
   *
   * GET /api/usage/summary
   *
   * @param req Authenticated request with user information
   * @returns Usage summary with per-resource usage, caps, percentages, and reset timestamps
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, max-age=30')
  async getSummary(@Req() req: AuthenticatedRequest): Promise<UsageSummaryDto> {
    const userId = req.user.id;
    const defaultWindowDays = Number(process.env.USAGE_WINDOW_DAYS) || 30;

    // Get user's plan, limits, and subscription period (cached for 5 minutes)
    const { plan, limits, subscriptionPeriod } =
      await this.billingPlanService.getUserPlan(userId);

    // Determine aggregation window based on subscription period and plan type
    const ONE_DAY_MS = 86_400_000;
    let windowStart: Date | undefined;
    let windowEnd: Date | undefined;
    let windowDays = defaultWindowDays;

    if (subscriptionPeriod?.currentPeriodStart) {
      // Check if this is a monthly plan (monthly limits should apply per billing month)
      const isMonthlyPlan = plan.periodUnit === 'monthly';

      if (isMonthlyPlan) {
        // For monthly plans: use current billing month window
        // This ensures monthly limits apply to the current billing month (e.g., Nov 9 - Dec 9)
        const billingMonth = this.calculateCurrentBillingMonth(
          subscriptionPeriod.currentPeriodStart,
        );
        windowStart = billingMonth.windowStart;
        windowEnd = billingMonth.windowEnd;

        // Calculate windowDays for the current billing month
        const diffMs = windowEnd.getTime() - windowStart.getTime();
        if (diffMs > 0) {
          windowDays = Math.max(1, Math.round(diffMs / ONE_DAY_MS));
        }
      } else {
        // For longer plans (6-month, yearly): use full subscription period
        windowStart = new Date(subscriptionPeriod.currentPeriodStart);
        windowStart.setUTCHours(0, 0, 0, 0);

        if (subscriptionPeriod.currentPeriodEnd) {
          windowEnd = new Date(subscriptionPeriod.currentPeriodEnd);
          windowEnd.setUTCHours(0, 0, 0, 0);

          const diffMs = windowEnd.getTime() - windowStart.getTime();
          if (diffMs > 0) {
            windowDays = Math.max(1, Math.round(diffMs / ONE_DAY_MS));
          }
        } else {
          // Period has no end date: calculate from start to now
          const now = new Date();
          const diffMs = now.getTime() - windowStart.getTime();
          if (diffMs > 0) {
            windowDays = Math.max(1, Math.round(diffMs / ONE_DAY_MS));
          }
        }
      }
    } else {
      // FREE plan: use monthly billing cycles based on account creation date
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });

      if (user?.createdAt) {
        // Calculate current billing month based on account creation date
        const billingMonth = this.calculateCurrentBillingMonth(user.createdAt);
        windowStart = billingMonth.windowStart;
        windowEnd = billingMonth.windowEnd;

        // Calculate windowDays for the current billing month
        const diffMs = windowEnd.getTime() - windowStart.getTime();
        if (diffMs > 0) {
          windowDays = Math.max(1, Math.round(diffMs / ONE_DAY_MS));
        }
      }
      // If user not found or no createdAt, fall back to rolling window (handled by UsageService)
    }

    // Get usage summary for all resources in a single efficient query
    const usageMap = await this.usageService.getUsageSummaryByResource(userId, {
      start: windowStart,
      end: windowEnd,
      windowDays,
    });

    // Determine reset timestamp
    // For monthly plans (including FREE): use end of current billing month
    // For longer plans: use currentPeriodEnd if available
    // Otherwise: calculate from oldest usage entry (rolling window reset)
    let resetTimestamp: string | undefined;
    if (subscriptionPeriod?.currentPeriodStart) {
      const isMonthlyPlan = plan.periodUnit === 'monthly';
      if (isMonthlyPlan) {
        // For monthly plans: reset at end of current billing month
        resetTimestamp = windowEnd?.toISOString();
      } else if (subscriptionPeriod.currentPeriodEnd) {
        // For longer plans: use full period end
        const periodEnd = new Date(subscriptionPeriod.currentPeriodEnd);
        periodEnd.setUTCHours(0, 0, 0, 0);
        resetTimestamp = periodEnd.toISOString();
      }
    } else if (windowEnd) {
      // FREE plan: reset at end of current billing month (based on account creation)
      resetTimestamp = windowEnd.toISOString();
    }

    // Get reset timestamps for all resources (only needed if no subscription period end)
    const displayLimits = limits.filter(
      (limit) => !OMITTED_USAGE_RESOURCES.has(limit.resource),
    );

    const resourceNames = displayLimits.map((limit) => limit.resource);
    const resetMap = resetTimestamp
      ? new Map<string, string>()
      : await this.usageService.getWindowResetsAt(userId, resourceNames, {
          start: windowStart,
          end: windowEnd,
          windowDays,
        });

    // Build resources object with usage, caps, percentages, and reset timestamps
    const resources: Record<
      string,
      {
        used: number;
        cap: number;
        pct: number;
        resetsAt: string;
      }
    > = {};

    // Process each limit to build the response
    for (const limit of displayLimits) {
      const used = usageMap.get(limit.resource) || 0;
      const cap = limit.monthlyCap;
      const pct = cap > 0 ? Math.round((used / cap) * 100 * 100) / 100 : 0; // Round to 2 decimals
      const resetsAt =
        resetTimestamp ||
        resetMap.get(limit.resource) ||
        new Date().toISOString();

      resources[limit.resource] = {
        used,
        cap,
        pct,
        resetsAt,
      };
    }

    return {
      windowDays,
      resources,
      plan: {
        code: plan.code,
        name: plan.name,
      },
    };
  }
}
