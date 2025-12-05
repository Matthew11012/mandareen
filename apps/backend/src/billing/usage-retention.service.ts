import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_RETENTION_DAYS = 60;
const DEFAULT_CRON = process.env.USAGE_CLEANUP_SCHEDULE || '0 2 * * 0'; // weekly Sunday 02:00 UTC
const BATCH_SIZE = 10_000;

@Injectable()
export class UsageRetentionService {
  private readonly logger = new Logger(UsageRetentionService.name);
  private readonly retentionDays: number;

  constructor(private readonly prisma: PrismaService) {
    this.retentionDays = this.validateRetentionDays(
      Number(process.env.USAGE_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS,
    );
  }

  @Cron(DEFAULT_CRON)
  async cleanupOldRecords(): Promise<void> {
    const cutoff = this.getRetentionCutoffDate();
    const startedAt = Date.now();
    try {
      const usageDailyDeleted = await this.deleteInBatches(
        'UsageDaily',
        'day',
        cutoff,
      );
      const usageEventDeleted = await this.deleteInBatches(
        'UsageEvent',
        'occurredAt',
        cutoff,
      );

      this.logger.log({
        message: 'Usage retention cleanup completed',
        cutoff: cutoff.toISOString(),
        usageDailyDeleted,
        usageEventDeleted,
        durationMs: Date.now() - startedAt,
      });
    } catch (error: any) {
      this.logger.error(
        `Usage retention cleanup failed: ${error?.message || error}`,
        error?.stack,
      );
    }
  }

  private getRetentionCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - this.retentionDays);
    cutoff.setUTCHours(0, 0, 0, 0);
    return cutoff;
  }

  private validateRetentionDays(days: number): number {
    if (!Number.isFinite(days) || days <= 0) {
      this.logger.warn(
        `Invalid USAGE_RETENTION_DAYS (${days}); falling back to ${DEFAULT_RETENTION_DAYS}`,
      );
      return DEFAULT_RETENTION_DAYS;
    }
    return Math.floor(days);
  }

  /**
   * Delete rows in batches using raw SQL with LIMIT to avoid long transactions.
   */
  private async deleteInBatches(
    table: 'UsageDaily' | 'UsageEvent',
    dateColumn: 'day' | 'occurredAt',
    cutoff: Date,
  ): Promise<number> {
    let totalDeleted = 0;

    while (true) {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ id: bigint | number }>
      >(
        `WITH cte AS (
          SELECT id FROM "${table}"
          WHERE "${dateColumn}" < $1
          ORDER BY id
          LIMIT $2
        )
        DELETE FROM "${table}" t
        USING cte
        WHERE t.id = cte.id
        RETURNING t.id;`,
        cutoff,
        BATCH_SIZE,
      );

      const deleted = Array.isArray(rows) ? rows.length : 0;
      totalDeleted += deleted;

      if (deleted < BATCH_SIZE) break;
    }

    return totalDeleted;
  }
}
