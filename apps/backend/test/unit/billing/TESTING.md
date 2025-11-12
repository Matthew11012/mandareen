# Testing Guide for Billing Services

This document provides guidance for testing the billing services.

## Unit Tests

Unit tests are available for all billing services:
- `billing-plan.service.spec.ts` - Tests plan resolution, caching, fallback behavior
- `usage.service.spec.ts` - Tests usage tracking, idempotency, quota enforcement
- `rate-limit.service.spec.ts` - Tests token bucket algorithm, refill timing
- `concurrency.service.spec.ts` - Tests lock acquire/release, TTL expiry

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run specific test file
npm test billing-plan.service.spec.ts

# Run with coverage
npm run test:cov

# Run in watch mode
npm run test:watch
```

### Test Coverage

Unit tests cover:
- ✅ Plan resolution precedence (active subscription > FREE fallback)
- ✅ Caching behavior (TTL, cache invalidation)
- ✅ Error handling for missing plans
- ✅ 30-day rolling sum calculation
- ✅ Idempotency (duplicate keys)
- ✅ Race safety (transactional upsert)
- ✅ Quota exceeded error conditions
- ✅ Token bucket edge cases (burst limits, refill timing)
- ✅ Lock acquire/release
- ✅ TTL expiry cleanup
- ✅ Concurrency limit enforcement

## Integration Tests

Integration tests verify that billing enforcement works correctly in controller endpoints. These tests require a test database setup.

### Setup

1. Create a test database
2. Run migrations: `npx prisma migrate dev`
3. Seed test data: `npx ts-node apps/backend/src/scripts/seed-plans.ts`

### Test Scenarios

#### Conversations Controller

**Text Messages**:
- ✅ Quota exceeded path (returns 403)
- ✅ Rate limit exceeded path (returns 429)
- ✅ Idempotency (repeat request with same key)
- ✅ Successful request with enforcement

**Audio Messages**:
- ✅ Same as text messages

**SSE Streams**:
- ✅ Concurrency limit exceeded (returns 429)
- ✅ Lock release on stream completion
- ✅ Lock release on stream error
- ✅ Lock release on client disconnect

#### Lessons Controller

**Lesson Generation Stream**:
- ✅ Quota exceeded path (returns 403)
- ✅ Rate limit exceeded path (returns 429)
- ✅ Idempotency (duplicate generation requests)
- ✅ Successful generation with enforcement

#### Curriculum Controller

**Activity Generation**:
- ✅ Quota exceeded path (returns 403)
- ✅ Rate limit exceeded path (returns 429)
- ✅ Idempotency (duplicate generation requests)
- ✅ Successful generation with enforcement

#### Assessment Controller

**Assessment Questions**:
- ✅ Quota exceeded path (returns 403)
- ✅ Rate limit exceeded path (returns 429)
- ✅ Idempotency (assessment sessions)
- ✅ Successful assessment with enforcement

### Running Integration Tests

```bash
# Run e2e tests
npm run test:e2e

# Run specific e2e test file
npm run test:e2e conversations.e2e-spec.ts
```

## Performance Validation

Performance validation ensures that billing operations meet performance requirements.

### Running Performance Validation

```bash
# Run performance validation script
npx ts-node apps/backend/src/billing/performance-validation.ts
```

### Performance Requirements

- **UsageDaily aggregates**: P95 < 10ms
- **Plan cache hit**: P95 < 1ms
- **Rate limiting**: P95 < 1ms (in-memory)
- **Concurrency locks**: P95 < 50ms

### Performance Test Results

The performance validation script measures:
- UsageDaily aggregate query performance
- BillingPlanService cache hit/miss performance
- RateLimitService token bucket performance (in-memory)
- ConcurrencyService lock acquire/release performance
- Idempotency check performance

## Manual Testing

### Testing Feature Flags

1. **Log-Only Mode** (enforcement disabled):
   ```bash
   USAGE_ENFORCE=false
   RATELIMIT_ENFORCE=false
   CONCURRENCY_ENFORCE=false
   ```
   - Verify that requests are allowed even when limits are exceeded
   - Check logs for `[LOG-ONLY]` messages
   - Verify usage is still recorded

2. **Enforcement Mode** (enforcement enabled):
   ```bash
   USAGE_ENFORCE=true
   RATELIMIT_ENFORCE=true
   CONCURRENCY_ENFORCE=true
   ```
   - Verify that requests are blocked when limits are exceeded
   - Check error responses (403 for quota, 429 for rate limits)
   - Verify `retryAfter` headers in rate limit responses

### Testing Quota Enforcement

1. **Setup**: Create a user with a FREE plan (50 messages/month)
2. **Test**: Send 51 messages
3. **Expected**: 51st message should return 403 with `QUOTA_EXCEEDED` error
4. **Verify**: Check `UsageEvent` and `UsageDaily` tables for usage records

### Testing Rate Limiting

1. **Setup**: Set RPM limit to 10/min for a resource
2. **Test**: Send 11 requests in quick succession
3. **Expected**: 11th request should return 429 with `RATE_LIMITED` error
4. **Verify**: Check `retryAfter` value (should be ~6 seconds for next token)

### Testing Concurrency Limits

1. **Setup**: Set concurrency limit to 2 for SSE streams
2. **Test**: Open 3 SSE streams simultaneously
3. **Expected**: 3rd stream should return 429 with `CONCURRENCY_LIMIT` error
4. **Verify**: Check `ConcurrencyLock` table for active locks

### Testing Idempotency

1. **Setup**: Send a request with an idempotency key
2. **Test**: Send the same request again with the same idempotency key
3. **Expected**: Second request should not count as additional usage
4. **Verify**: Check `UsageEvent` table - should only have one record with the idempotency key

## Test Data Setup

### Seed Test Plans

```bash
npx ts-node apps/backend/src/scripts/seed-plans.ts
```

This creates:
- FREE plan (50 messages/month, 5 RPM)
- BASIC plan (500 messages/month, 30 RPM)
- PREMIUM plan (unlimited messages, 100 RPM)

### Create Test User

```sql
INSERT INTO "User" (email, password_hashed, created_at, updated_at)
VALUES ('test@example.com', 'hashed_password', NOW(), NOW());
```

### Create Test Subscription

```sql
INSERT INTO "UserSubscription" (user_id, plan_id, status, created_at, updated_at)
VALUES (1, 2, 'active', NOW(), NOW());
```

## Debugging

### Enable Debug Logging

Set log level to debug in your environment:
```bash
LOG_LEVEL=debug
```

### Check Cache State

```typescript
// Clear cache to force refresh
billingPlanService.clearCache(userId);
billingPlanService.clearAllCache();

// Clear rate limit buckets
rateLimitService.clearBucket(userId, resource);
rateLimitService.clearAllBuckets();
```

### Check Database State

```sql
-- Check usage events
SELECT * FROM "UsageEvent" WHERE user_id = 1 ORDER BY occurred_at DESC LIMIT 10;

-- Check daily aggregates
SELECT * FROM "UsageDaily" WHERE user_id = 1 ORDER BY day DESC LIMIT 10;

-- Check concurrency locks
SELECT * FROM "ConcurrencyLock" WHERE user_id = 1;

-- Check active subscriptions
SELECT * FROM "UserSubscription" WHERE user_id = 1 AND status = 'active';
```

## Continuous Integration

### GitHub Actions

Add to `.github/workflows/test.yml`:

```yaml
- name: Run unit tests
  run: npm test

- name: Run e2e tests
  run: npm run test:e2e
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

- name: Run performance validation
  run: npx ts-node apps/backend/src/billing/performance-validation.ts
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

## Troubleshooting

### Tests Failing

1. **Check database connection**: Ensure test database is running
2. **Check migrations**: Run `npx prisma migrate dev`
3. **Check seed data**: Run `npx ts-node apps/backend/src/scripts/seed-plans.ts`
4. **Check environment variables**: Ensure test env vars are set

### Performance Issues

1. **Check database indexes**: Ensure indexes exist on `UsageDaily` table
2. **Check cache hit rate**: Monitor cache performance
3. **Check query performance**: Use `EXPLAIN ANALYZE` on slow queries
4. **Check connection pool**: Ensure database connection pool is configured correctly

### Idempotency Issues

1. **Check metadata format**: Ensure idempotency keys are stored correctly
2. **Check time window**: Idempotency checks last 24 hours
3. **Check event count**: Only last 100 events are checked for performance

## Future Enhancements

1. **Automated integration tests** with test database
2. **Load testing** with realistic traffic patterns
3. **Chaos engineering** tests for failure scenarios
4. **Performance benchmarking** in CI/CD pipeline

