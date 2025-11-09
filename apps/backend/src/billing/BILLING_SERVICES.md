# Billing Services Documentation

This document provides comprehensive documentation for the billing and rate limiting services in the Mandareen backend.

## Overview

The billing system consists of four core services:
1. **BillingPlanService** - Resolves user plans and limits
2. **UsageService** - Tracks usage and enforces quotas
3. **RateLimitService** - Enforces rate limits (RPM/burst)
4. **ConcurrencyService** - Manages concurrency limits (e.g., SSE streams)

## Services

### BillingPlanService

**Purpose**: Resolves user billing plans and resource limits.

**Key Methods**:
- `getUserPlan(userId: number)` - Gets user's active plan and all limits
- `getLimit(userId: number, resource: string)` - Gets specific limit for a resource
- `clearCache(userId: number)` - Clears cache for a user
- `clearAllCache()` - Clears all cached plans

**Features**:
- Caches plan data in memory (5-minute TTL, configurable via `PLAN_CACHE_TTL_SECONDS`)
- Prioritizes active subscriptions over FREE plan
- Falls back to conservative FREE plan if database plan not found
- Automatic cache expiration

**Usage Example**:
```typescript
const plan = await billingPlanService.getUserPlan(userId);
const limit = await billingPlanService.getLimit(userId, 'convo_message_text');
```

### UsageService

**Purpose**: Tracks usage and enforces quotas with rolling 30-day windows.

**Key Methods**:
- `sumUsedLastNDays(userId: number, resource: string, nDays?: number)` - Sums usage over N days
- `checkAndConsume(args: CheckAndConsumeArgs)` - Checks quota and records usage
- `recordAnalytics(args: RecordAnalyticsArgs)` - Records usage without quota enforcement

**Features**:
- Rolling 30-day window (configurable via `USAGE_WINDOW_DAYS`)
- Idempotency support (prevents double-counting)
- Transactional usage recording (race-safe)
- Log-only mode (configurable via `USAGE_ENFORCE`)

**Usage Example**:
```typescript
// Check and consume quota
await usageService.checkAndConsume({
  userId,
  resource: 'convo_message_text',
  amount: 1,
  planCap: 100,
  idempotencyKey: 'msg:123',
});

// Record analytics (no quota enforcement)
await usageService.recordAnalytics({
  userId,
  resource: 'convo_message_text',
  amount: 1,
  idempotencyKey: 'msg:123',
});
```

**Idempotency**: Uses `idempotencyKey` in `UsageEvent.metadata` to prevent double-counting. Checks last 24 hours of events for duplicates.

### RateLimitService

**Purpose**: Enforces rate limits using token bucket algorithm.

**Key Methods**:
- `acquire(args: AcquireArgs)` - Acquires tokens from bucket
- `getTokenCount(userId: number, resource: string)` - Gets current token count
- `clearBucket(userId: number, resource: string)` - Clears bucket for user/resource
- `clearAllBuckets()` - Clears all buckets

**Features**:
- Token bucket algorithm (in-memory)
- Automatic token refill based on RPM
- Burst capacity (default: 2x RPM)
- Log-only mode (configurable via `RATELIMIT_ENFORCE`)
- Per-user, per-resource isolation

**Usage Example**:
```typescript
await rateLimitService.acquire({
  userId,
  resource: 'convo_message_text',
  rpm: 60,
  burst: 120,
  tokens: 1,
});
```

**Algorithm**: 
- Tokens refill at rate of `rpm / 60` tokens per second
- Capacity is `burst` (default: `rpm * 2`)
- Throws `RateLimitedError` with `retryAfter` (seconds) when insufficient tokens

### ConcurrencyService

**Purpose**: Manages concurrency limits (e.g., simultaneous SSE streams).

**Key Methods**:
- `acquire(args: AcquireArgs)` - Acquires concurrency lock
- `refresh(lockKey: string, ttlMs: number)` - Refreshes lock expiration
- `release(lockKey: string)` - Releases lock
- `cleanupExpiredLocks()` - Cleans up expired locks
- `getActiveCount(userId: number, resource: string)` - Gets active lock count
- `releaseAll(userId: number, resource: string)` - Releases all locks for user/resource

**Features**:
- Database-backed locks (uses `ConcurrencyLock` table)
- TTL-based expiration
- Automatic cleanup of expired locks
- Log-only mode (configurable via `CONCURRENCY_ENFORCE`)
- Per-user, per-resource isolation

**Usage Example**:
```typescript
// Acquire lock
const { lockKey } = await concurrencyService.acquire({
  userId,
  resource: 'convo_stream',
  limit: 5,
  ttlMs: 120000, // 120 seconds
});

try {
  // Perform operation
} finally {
  // Release lock
  await concurrencyService.release(lockKey);
}
```

## Error Handling

All services throw structured errors that extend `HttpException`:

### QuotaExceededError
- **HTTP Status**: 403 Forbidden
- **Code**: `QUOTA_EXCEEDED`
- **Fields**: `resource`, `planCap`, `used`
- **Thrown by**: `UsageService.checkAndConsume()`

### RateLimitedError
- **HTTP Status**: 429 Too Many Requests
- **Code**: `RATE_LIMITED`
- **Fields**: `resource`, `retryAfter` (seconds)
- **Thrown by**: `RateLimitService.acquire()`

### ConcurrencyLimitError
- **HTTP Status**: 429 Too Many Requests
- **Code**: `CONCURRENCY_LIMIT`
- **Fields**: `resource`, `limit`, `retryAfter` (seconds)
- **Thrown by**: `ConcurrencyService.acquire()`

## Feature Flags

All enforcement can be disabled via environment variables for staged rollout:

- `USAGE_ENFORCE` (default: `false`) - Enable/disable quota enforcement
- `RATELIMIT_ENFORCE` (default: `false`) - Enable/disable rate limit enforcement
- `CONCURRENCY_ENFORCE` (default: `false`) - Enable/disable concurrency limit enforcement
- `USAGE_WINDOW_DAYS` (default: `30`) - Rolling window for usage tracking
- `PLAN_CACHE_TTL_SECONDS` (default: `300`) - Cache TTL for plan data

**Log-Only Mode**: When flags are `false`, services compute enforcement decisions and log them but do not throw errors. This allows monitoring and gradual rollout.

## Resource Constants

Resources are defined in `billing-resources.constants.ts`:

- `CONVO_MESSAGE_TEXT` - Text messages in conversations
- `CONVO_MESSAGE_AUDIO` - Audio messages in conversations
- `CONVO_TTS_SECONDS` - TTS audio generation (seconds)
- `LESSON_CUSTOM_GENERATED` - Custom lesson generation
- `CURRICULUM_GENERATED` - Curriculum activity generation
- `ASSESSMENT_TAKEN` - Assessment sessions
- `CONVO_STREAM` - Concurrent conversation streams

## Performance Considerations

### Caching
- Plan data is cached in memory (5-minute TTL)
- Rate limit buckets are stored in memory
- Usage daily aggregates are used for efficient 30-day sums

### Database Operations
- Usage tracking uses transactions for race safety
- Daily aggregates (`UsageDaily`) reduce query complexity
- Idempotency checks limit to last 24 hours (100 events max)

### Scalability
- In-memory rate limiting works for single-instance deployments
- For multi-instance, consider Redis-based rate limiting (future enhancement)
- Concurrency locks are database-backed for multi-instance consistency

## Testing

Unit tests are available for all services:
- `billing-plan.service.spec.ts`
- `usage.service.spec.ts`
- `rate-limit.service.spec.ts`
- `concurrency.service.spec.ts`

Run tests with:
```bash
npm test
```

## Enforcement Points

Enforcement is integrated into the following controllers:

1. **ConversationsController**
   - Text messages (`POST /conversations/:id/messages`)
   - Audio messages (`POST /conversations/:id/audio`)
   - SSE streams (`SSE /conversations/:id/stream`)
   - TTS metering (in `ConversationsService`)

2. **LessonsStreamController**
   - Lesson generation (`SSE /lessons/generate/stream`)

3. **CurriculumController**
   - Activity generation (`POST /curriculum/units/:unitId/lessons/:lessonId/generate`)

4. **AssessmentController**
   - Assessment questions (`GET /assess/questions`)
   - Assessment stream (`SSE /assess/questions/stream`)

## Idempotency Keys

Idempotency keys prevent double-counting of usage events. Format:

- Conversations: `msg:{messageId}`
- TTS: `tts:{messageId}`
- Lesson generation: `gen:{requestId}` or `gen:{uuid}`
- Curriculum: `curri:{userId}:{unitId}:{lessonId}:{levelBand}`
- Assessment: `assessment:{userId}:{sessionId}`

## Monitoring

Services log enforcement decisions:
- `[LOG-ONLY]` prefix indicates log-only mode
- Quota exceeded: Warning level
- Rate limit exceeded: Warning level
- Concurrency limit exceeded: Warning level
- Successful operations: Debug level

## Future Enhancements

1. **Redis-based rate limiting** for multi-instance deployments
2. **Background job** for cleaning up expired concurrency locks
3. **Usage analytics dashboard** for monitoring
4. **Webhook notifications** for quota/rate limit events
5. **Grace periods** for quota exceeded scenarios

