import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConcurrencyLimitError } from './errors/billing.errors';
import { randomUUID } from 'crypto';

interface AcquireArgs {
  userId: number;
  resource: string;
  limit: number;
  ttlMs: number;
  metadata?: any;
}

/**
 * Service for managing concurrency limits (e.g., SSE streams).
 * Uses ConcurrencyLock table to track active operations.
 */
@Injectable()
export class ConcurrencyService {
  private readonly logger = new Logger(ConcurrencyService.name);
  private readonly enforceConcurrency: boolean;

  constructor(private readonly prisma: PrismaService) {
    this.enforceConcurrency = process.env.CONCURRENCY_ENFORCE === 'true';
  }

  /**
   * Acquire a concurrency lock for a user and resource.
   * Throws ConcurrencyLimitError if limit reached.
   * Returns lockKey that must be used for release/refresh.
   *
   * In log-only mode (CONCURRENCY_ENFORCE=false), computes and logs but does not throw.
   */
  async acquire(args: AcquireArgs): Promise<{ lockKey: string }> {
    const { userId, resource, limit, ttlMs, metadata } = args;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const lockKey = `user:${userId}:${resource}:${randomUUID()}`;

    // Clean up expired locks first
    await this.cleanupExpiredLocks();

    // Count active locks for this user and resource
    const activeCount = await this.prisma.concurrencyLock.count({
      where: {
        userId,
        resource,
        expiresAt: {
          gt: now,
        },
      },
    });

    const wouldExceed = activeCount >= limit;

    // Log-only mode: compute and log but don't throw
    if (!this.enforceConcurrency) {
      this.logger.log(
        `[LOG-ONLY] Concurrency check for user ${userId}, resource ${resource}: active=${activeCount}, limit=${limit}, wouldExceed=${wouldExceed}`,
      );
      // Still create lock even in log-only mode for realistic behavior
      await this.prisma.concurrencyLock.create({
        data: {
          key: lockKey,
          userId,
          resource,
          acquiredAt: now,
          expiresAt,
          metadata: metadata || {},
        },
      });
      return { lockKey };
    }

    // Enforce mode: throw if limit reached
    if (wouldExceed) {
      // Calculate retryAfter based on oldest lock expiration
      const oldestLock = await this.prisma.concurrencyLock.findFirst({
        where: {
          userId,
          resource,
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          expiresAt: 'asc',
        },
      });

      const retryAfter = oldestLock
        ? Math.ceil((oldestLock.expiresAt.getTime() - now.getTime()) / 1000)
        : 60; // Default 60 seconds

      this.logger.warn(
        `Concurrency limit exceeded for user ${userId}, resource ${resource}: active=${activeCount}, limit=${limit}, retryAfter=${retryAfter}s`,
      );

      throw new ConcurrencyLimitError(resource, limit, retryAfter);
    }

    // Create lock
    await this.prisma.concurrencyLock.create({
      data: {
        key: lockKey,
        userId,
        resource,
        acquiredAt: now,
        expiresAt,
        metadata: metadata || {},
      },
    });

    this.logger.debug(
      `Concurrency lock acquired for user ${userId}, resource ${resource}: lockKey=${lockKey}, active=${activeCount + 1}/${limit}`,
    );

    return { lockKey };
  }

  /**
   * Refresh a lock's expiration time.
   * Useful for long-running operations that need to extend their TTL.
   */
  async refresh(lockKey: string, ttlMs: number): Promise<void> {
    const lock = await this.prisma.concurrencyLock.findUnique({
      where: { key: lockKey },
    });

    if (!lock) {
      this.logger.warn(`Lock ${lockKey} not found for refresh`);
      return;
    }

    const now = new Date();
    if (lock.expiresAt < now) {
      this.logger.warn(`Lock ${lockKey} has already expired`);
      await this.prisma.concurrencyLock.delete({
        where: { key: lockKey },
      });
      return;
    }

    const newExpiresAt = new Date(now.getTime() + ttlMs);

    await this.prisma.concurrencyLock.update({
      where: { key: lockKey },
      data: { expiresAt: newExpiresAt },
    });

    this.logger.debug(
      `Refreshed lock ${lockKey}, new expiresAt=${newExpiresAt.toISOString()}`,
    );
  }

  /**
   * Release a lock.
   * Should be called in finally blocks to ensure cleanup.
   */
  async release(lockKey: string): Promise<void> {
    try {
      await this.prisma.concurrencyLock.delete({
        where: { key: lockKey },
      });
      this.logger.debug(`Released lock ${lockKey}`);
    } catch (error: any) {
      // Ignore if lock doesn't exist (already released or expired)
      if (error.code !== 'P2025') {
        this.logger.warn(`Error releasing lock ${lockKey}:`, error);
      }
    }
  }

  /**
   * Clean up expired locks.
   * Should be called periodically (e.g., by a background job in Phase 5).
   */
  async cleanupExpiredLocks(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.concurrencyLock.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    if (result.count > 0) {
      this.logger.debug(`Cleaned up ${result.count} expired locks`);
    }

    return result.count;
  }

  /**
   * Get active lock count for a user and resource (for debugging/monitoring).
   */
  async getActiveCount(userId: number, resource: string): Promise<number> {
    await this.cleanupExpiredLocks(); // Clean up first for accurate count

    return await this.prisma.concurrencyLock.count({
      where: {
        userId,
        resource,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  /**
   * Release all locks for a user and resource (useful for testing or manual cleanup).
   */
  async releaseAll(userId: number, resource: string): Promise<number> {
    const result = await this.prisma.concurrencyLock.deleteMany({
      where: {
        userId,
        resource,
      },
    });

    this.logger.debug(
      `Released ${result.count} locks for user ${userId}, resource ${resource}`,
    );

    return result.count;
  }
}
