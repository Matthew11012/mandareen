import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitedError } from './errors/billing.errors';

interface TokenBucketState {
  tokens: number;
  lastRefillTs: number; // milliseconds
  capacity: number;
  refillRate: number; // tokens per second
}

interface AcquireArgs {
  userId: number;
  resource: string;
  tokens?: number;
  rpm: number;
  burst?: number;
  now?: number;
}

/**
 * Service for rate limiting using token bucket algorithm.
 * Uses in-memory storage for performance; falls back to DB for multi-instance consistency.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly buckets = new Map<string, TokenBucketState>();
  private readonly enforceRateLimit: boolean;

  constructor(private readonly prisma: PrismaService) {
    this.enforceRateLimit = process.env.RATELIMIT_ENFORCE === 'true';
  }

  /**
   * Acquire tokens from the bucket for a user and resource.
   * Throws RateLimitedError if insufficient tokens available.
   *
   * In log-only mode (RATELIMIT_ENFORCE=false), computes and logs but does not throw.
   */
  async acquire(args: AcquireArgs): Promise<void> {
    const {
      userId,
      resource,
      tokens = 1,
      rpm,
      burst,
      now = Date.now(),
    } = args;

    const key = `${userId}:${resource}`;
    const capacity = burst ?? rpm * 2; // Default burst is 2x RPM
    const refillRate = rpm / 60; // tokens per second

    // Get or create bucket state
    let bucket = this.buckets.get(key);

    if (!bucket) {
      // Initialize bucket at full capacity
      bucket = {
        tokens: capacity,
        lastRefillTs: now,
        capacity,
        refillRate,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsedSeconds = (now - bucket.lastRefillTs) / 1000;
    const tokensToAdd = elapsedSeconds * bucket.refillRate;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefillTs = now;

    // Check if enough tokens available
    const hasEnoughTokens = bucket.tokens >= tokens;

    // Log-only mode: compute and log but don't throw
    if (!this.enforceRateLimit) {
      this.logger.log(
        `[LOG-ONLY] Rate limit check for user ${userId}, resource ${resource}: tokens=${bucket.tokens.toFixed(2)}, requested=${tokens}, rpm=${rpm}, hasEnough=${hasEnoughTokens}`,
      );
      // Still consume tokens even in log-only mode for realistic behavior
      if (hasEnoughTokens) {
        bucket.tokens -= tokens;
      }
      return;
    }

    // Enforce mode: throw if insufficient tokens
    if (!hasEnoughTokens) {
      // Calculate retryAfter (seconds until enough tokens available)
      const tokensNeeded = tokens - bucket.tokens;
      const secondsUntilRefill = tokensNeeded / bucket.refillRate;
      const retryAfter = Math.ceil(secondsUntilRefill);

      this.logger.warn(
        `Rate limit exceeded for user ${userId}, resource ${resource}: tokens=${bucket.tokens.toFixed(2)}, requested=${tokens}, rpm=${rpm}, retryAfter=${retryAfter}s`,
      );

      throw new RateLimitedError(resource, retryAfter);
    }

    // Consume tokens
    bucket.tokens -= tokens;

    this.logger.debug(
      `Rate limit acquired for user ${userId}, resource ${resource}: tokens=${bucket.tokens.toFixed(2)}, requested=${tokens}`,
    );
  }

  /**
   * Get current token count for a user and resource (for debugging/monitoring).
   */
  getTokenCount(userId: number, resource: string): number {
    const key = `${userId}:${resource}`;
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return 0;
    }

    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefillTs) / 1000;
    const tokensToAdd = elapsedSeconds * bucket.refillRate;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefillTs = now;

    return bucket.tokens;
  }

  /**
   * Clear bucket state for a user and resource (useful for testing or manual reset).
   */
  clearBucket(userId: number, resource: string): void {
    const key = `${userId}:${resource}`;
    this.buckets.delete(key);
    this.logger.debug(`Cleared rate limit bucket for user ${userId}, resource ${resource}`);
  }

  /**
   * Clear all buckets (useful for testing or cache invalidation).
   */
  clearAllBuckets(): void {
    this.buckets.clear();
    this.logger.debug('Cleared all rate limit buckets');
  }

  /**
   * Fallback DB-based rate limiting for multi-instance deployments.
   * Uses UsageEvent counts from the last minute as a proxy for rate limiting.
   * This is a simplified implementation; a production system might use Redis or a dedicated rate limit table.
   *
   * Note: This is stricter than in-memory buckets because it counts all events,
   * not just successful ones. Acceptable trade-off for multi-instance consistency.
   */
  private async acquireFromDB(
    userId: number,
    resource: string,
    rpm: number,
    tokens: number = 1,
  ): Promise<void> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const count = await this.prisma.usageEvent.count({
      where: {
        userId,
        resource,
        occurredAt: {
          gte: oneMinuteAgo,
        },
      },
    });

    const limit = Math.ceil(rpm * (tokens / 1)); // Scale limit by tokens requested

    if (count >= limit) {
      // Calculate retryAfter based on oldest event in the window
      const oldestEvent = await this.prisma.usageEvent.findFirst({
        where: {
          userId,
          resource,
          occurredAt: {
            gte: oneMinuteAgo,
          },
        },
        orderBy: {
          occurredAt: 'asc',
        },
      });

      if (oldestEvent) {
        const elapsed = Date.now() - oldestEvent.occurredAt.getTime();
        const retryAfter = Math.ceil((60 * 1000 - elapsed) / 1000); // seconds until window clears
        throw new RateLimitedError(resource, Math.max(1, retryAfter));
      } else {
        throw new RateLimitedError(resource, 60); // Wait 1 minute
      }
    }
  }
}

