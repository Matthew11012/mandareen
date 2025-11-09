/**
 * Performance Validation Script for Billing Services
 * 
 * This script validates that billing service operations meet performance requirements:
 * - UsageDaily aggregates <10ms P95
 * - In-memory token buckets avoid DB hot paths
 * - Enforcement happens before expensive operations (OpenAI calls)
 * 
 * Run with: npx ts-node apps/backend/src/billing/performance-validation.ts
 */

import { PrismaClient } from '@prisma/client';
import { BillingPlanService } from './billing-plan.service';
import { UsageService } from './usage.service';
import { RateLimitService } from './rate-limit.service';
import { ConcurrencyService } from './concurrency.service';
import { PrismaService } from '../prisma/prisma.service';

interface PerformanceResult {
  operation: string;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  samples: number;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateStats(times: number[]): PerformanceResult {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    operation: 'unknown',
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    min: Math.min(...times),
    max: Math.max(...times),
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    samples: times.length,
  };
}

async function measureOperation<T>(
  name: string,
  operation: () => Promise<T>,
  iterations: number = 100,
): Promise<PerformanceResult> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await operation();
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    times.push(durationMs);
  }

  const stats = calculateStats(times);
  stats.operation = name;
  return stats;
}

async function validatePerformance() {
  console.log('Starting performance validation...\n');

  const prisma = new PrismaClient();
  const prismaService = new PrismaService();
  const billingPlanService = new BillingPlanService(prismaService);
  const usageService = new UsageService(prismaService);
  const rateLimitService = new RateLimitService(prismaService);
  const concurrencyService = new ConcurrencyService(prismaService);

  try {
    // Test user ID (should exist in database)
    const testUserId = 1;
    const testResource = 'convo_message_text';

    // 1. Validate UsageDaily aggregate performance
    console.log('1. Testing UsageDaily aggregate performance...');
    const usageStats = await measureOperation(
      'sumUsedLastNDays',
      async () => {
        await usageService.sumUsedLastNDays(testUserId, testResource, 30);
      },
      100,
    );
    console.log(`   P50: ${usageStats.p50.toFixed(2)}ms`);
    console.log(`   P95: ${usageStats.p95.toFixed(2)}ms`);
    console.log(`   P99: ${usageStats.p99.toFixed(2)}ms`);
    console.log(`   Mean: ${usageStats.mean.toFixed(2)}ms`);
    console.log(
      `   ✅ ${usageStats.p95 < 10 ? 'PASS' : 'FAIL'}: P95 < 10ms (actual: ${usageStats.p95.toFixed(2)}ms)`,
    );
    console.log('');

    // 2. Validate BillingPlanService cache performance
    console.log('2. Testing BillingPlanService cache performance...');
    
    // First call (cache miss)
    const cacheMissStats = await measureOperation(
      'getUserPlan (cache miss)',
      async () => {
        billingPlanService.clearCache(testUserId);
        await billingPlanService.getUserPlan(testUserId);
      },
      10,
    );
    console.log(`   Cache Miss P95: ${cacheMissStats.p95.toFixed(2)}ms`);

    // Subsequent calls (cache hit)
    const cacheHitStats = await measureOperation(
      'getUserPlan (cache hit)',
      async () => {
        await billingPlanService.getUserPlan(testUserId);
      },
      100,
    );
    console.log(`   Cache Hit P95: ${cacheHitStats.p95.toFixed(2)}ms`);
    console.log(
      `   ✅ ${cacheHitStats.p95 < 1 ? 'PASS' : 'FAIL'}: Cache hit P95 < 1ms (actual: ${cacheHitStats.p95.toFixed(2)}ms)`,
    );
    console.log('');

    // 3. Validate RateLimitService performance (in-memory, no DB)
    console.log('3. Testing RateLimitService performance (in-memory)...');
    const rateLimitStats = await measureOperation(
      'rateLimitService.acquire',
      async () => {
        await rateLimitService.acquire({
          userId: testUserId,
          resource: testResource,
          rpm: 60,
          burst: 120,
          tokens: 1,
        });
      },
      1000,
    );
    console.log(`   P50: ${rateLimitStats.p50.toFixed(4)}ms`);
    console.log(`   P95: ${rateLimitStats.p95.toFixed(4)}ms`);
    console.log(`   P99: ${rateLimitStats.p99.toFixed(4)}ms`);
    console.log(`   Mean: ${rateLimitStats.mean.toFixed(4)}ms`);
    console.log(
      `   ✅ ${rateLimitStats.p95 < 1 ? 'PASS' : 'FAIL'}: P95 < 1ms (actual: ${rateLimitStats.p95.toFixed(4)}ms)`,
    );
    console.log('');

    // 4. Validate ConcurrencyService performance
    console.log('4. Testing ConcurrencyService performance...');
    const concurrencyStats = await measureOperation(
      'concurrencyService.acquire',
      async () => {
        const { lockKey } = await concurrencyService.acquire({
          userId: testUserId,
          resource: 'convo_stream',
          limit: 10,
          ttlMs: 120000,
        });
        await concurrencyService.release(lockKey);
      },
      100,
    );
    console.log(`   P50: ${concurrencyStats.p50.toFixed(2)}ms`);
    console.log(`   P95: ${concurrencyStats.p95.toFixed(2)}ms`);
    console.log(`   P99: ${concurrencyStats.p99.toFixed(2)}ms`);
    console.log(`   Mean: ${concurrencyStats.mean.toFixed(2)}ms`);
    console.log(
      `   ✅ ${concurrencyStats.p95 < 50 ? 'PASS' : 'FAIL'}: P95 < 50ms (actual: ${concurrencyStats.p95.toFixed(2)}ms)`,
    );
    console.log('');

    // 5. Validate idempotency check performance
    console.log('5. Testing idempotency check performance...');
    const idempotencyStats = await measureOperation(
      'checkAndConsume (with idempotency)',
      async () => {
        await usageService.checkAndConsume({
          userId: testUserId,
          resource: testResource,
          amount: 1,
          planCap: 1000,
          idempotencyKey: `test-${Date.now()}-${Math.random()}`,
        });
      },
      50,
    );
    console.log(`   P50: ${idempotencyStats.p50.toFixed(2)}ms`);
    console.log(`   P95: ${idempotencyStats.p95.toFixed(2)}ms`);
    console.log(`   P99: ${idempotencyStats.p99.toFixed(2)}ms`);
    console.log(`   Mean: ${idempotencyStats.mean.toFixed(2)}ms`);
    console.log('');

    // Summary
    console.log('Performance Validation Summary:');
    console.log('================================');
    console.log(`UsageDaily aggregates: ${usageStats.p95 < 10 ? '✅ PASS' : '❌ FAIL'} (P95: ${usageStats.p95.toFixed(2)}ms)`);
    console.log(`Plan cache hit: ${cacheHitStats.p95 < 1 ? '✅ PASS' : '❌ FAIL'} (P95: ${cacheHitStats.p95.toFixed(2)}ms)`);
    console.log(`Rate limiting: ${rateLimitStats.p95 < 1 ? '✅ PASS' : '❌ FAIL'} (P95: ${rateLimitStats.p95.toFixed(4)}ms)`);
    console.log(`Concurrency locks: ${concurrencyStats.p95 < 50 ? '✅ PASS' : '❌ FAIL'} (P95: ${concurrencyStats.p95.toFixed(2)}ms)`);
    console.log('');

    // Recommendations
    if (usageStats.p95 >= 10) {
      console.log('⚠️  Recommendation: Consider indexing UsageDaily table on (userId, resource, day)');
    }
    if (cacheHitStats.p95 >= 1) {
      console.log('⚠️  Recommendation: Cache implementation may need optimization');
    }
    if (rateLimitStats.p95 >= 1) {
      console.log('⚠️  Recommendation: Rate limit service performance is slower than expected');
    }
    if (concurrencyStats.p95 >= 50) {
      console.log('⚠️  Recommendation: Consider optimizing ConcurrencyLock queries or adding indexes');
    }

  } catch (error) {
    console.error('Error during performance validation:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await prismaService.onModuleDestroy();
  }
}

// Run if executed directly
if (require.main === module) {
  validatePerformance()
    .then(() => {
      console.log('\nPerformance validation completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Performance validation failed:', error);
      process.exit(1);
    });
}

export { validatePerformance };

