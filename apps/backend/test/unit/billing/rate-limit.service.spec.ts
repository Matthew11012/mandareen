import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from '../../../src/billing/rate-limit.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RateLimitedError } from '../../../src/billing/errors/billing.errors';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let prisma: PrismaService;

  const mockPrismaService = {
    usageEvent: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Reset env vars
    process.env.RATELIMIT_ENFORCE = 'true';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
    service.clearAllBuckets();
  });

  afterEach(() => {
    delete process.env.RATELIMIT_ENFORCE;
    service.clearAllBuckets();
  });

  describe('acquire', () => {
    it('should allow request when tokens available', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60; // 60 requests per minute

      await service.acquire({
        userId,
        resource,
        rpm,
        tokens: 1,
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should throw RateLimitedError when tokens insufficient', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60; // 60 requests per minute
      const burst = 120; // 120 token capacity

      // Consume all tokens
      for (let i = 0; i < burst; i++) {
        await service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
      }

      // Next request should be rate limited
      await expect(
        service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        }),
      ).rejects.toThrow(RateLimitedError);
    });

    it('should refill tokens over time', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60; // 60 requests per minute = 1 token per second
      const burst = 60;

      // Consume all tokens
      for (let i = 0; i < burst; i++) {
        await service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
          now: Date.now(),
        });
      }

      // Wait 1 second (should refill 1 token)
      const now = Date.now() + 1000;
      await service.acquire({
        userId,
        resource,
        rpm,
        burst,
        tokens: 1,
        now,
      });

      // Should not throw (token refilled)
      expect(true).toBe(true);
    });

    it('should calculate retryAfter correctly', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60; // 1 token per second
      const burst = 60;

      // Consume all tokens
      for (let i = 0; i < burst; i++) {
        await service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
      }

      // Next request should be rate limited with retryAfter
      try {
        await service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
        fail('Should have thrown RateLimitedError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitedError);
        expect((error as RateLimitedError).retryAfter).toBeGreaterThan(0);
      }
    });

    it('should use default burst (2x RPM) when not provided', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60; // Should default to burst = 120

      // Should be able to consume 120 tokens (2x RPM)
      for (let i = 0; i < 120; i++) {
        await service.acquire({
          userId,
          resource,
          rpm,
          tokens: 1,
        });
      }

      // 121st request should be rate limited
      await expect(
        service.acquire({
          userId,
          resource,
          rpm,
          tokens: 1,
        }),
      ).rejects.toThrow(RateLimitedError);
    });

    it('should handle multiple tokens per request', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60;
      const burst = 120;

      // Consume 60 tokens at once (should work)
      await service.acquire({
        userId,
        resource,
        rpm,
        burst,
        tokens: 60,
      });

      // Consume 60 more tokens (should work)
      await service.acquire({
        userId,
        resource,
        rpm,
        burst,
        tokens: 60,
      });

      // Next request should be rate limited (all tokens consumed)
      await expect(
        service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        }),
      ).rejects.toThrow(RateLimitedError);
    });

    it('should not throw in log-only mode', async () => {
      // Set env var before creating new service instance
      const originalEnv = process.env.RATELIMIT_ENFORCE;
      process.env.RATELIMIT_ENFORCE = 'false';

      // Create new service instance with log-only mode
      const logOnlyService = new RateLimitService(prisma);

      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60;
      const burst = 10;

      // Consume all tokens
      for (let i = 0; i < burst; i++) {
        await logOnlyService.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
      }

      // Should not throw in log-only mode
      await logOnlyService.acquire({
        userId,
        resource,
        rpm,
        burst,
        tokens: 1,
      });

      expect(true).toBe(true);

      // Restore original env
      process.env.RATELIMIT_ENFORCE = originalEnv;
    });

    it('should isolate buckets per user and resource', async () => {
      const userId1 = 1;
      const userId2 = 2;
      const resource = 'convo_message_text';
      const rpm = 60;
      const burst = 10;

      // Consume all tokens for user 1
      for (let i = 0; i < burst; i++) {
        await service.acquire({
          userId: userId1,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
      }

      // User 2 should still have tokens available
      await service.acquire({
        userId: userId2,
        resource,
        rpm,
        burst,
        tokens: 1,
      });

      // User 1 should be rate limited
      await expect(
        service.acquire({
          userId: userId1,
          resource,
          rpm,
          burst,
          tokens: 1,
        }),
      ).rejects.toThrow(RateLimitedError);
    });

    it('should cap tokens at capacity', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60; // 1 token per second
      const burst = 60;

      // Wait 2 minutes (should refill 120 tokens, but capped at 60)
      const now = Date.now() + 120 * 1000;

      // Manually refill by calling acquire with future timestamp
      await service.acquire({
        userId,
        resource,
        rpm,
        burst,
        tokens: 0, // Don't consume any tokens
        now,
      });

      // Should still be capped at burst capacity
      expect(service.getTokenCount(userId, resource)).toBeLessThanOrEqual(
        burst,
      );
    });
  });

  describe('getTokenCount', () => {
    it('should return current token count', () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60;
      const burst = 120;

      // Initially should have full capacity
      const initialCount = service.getTokenCount(userId, resource);
      expect(initialCount).toBe(0); // Bucket not created yet

      // After first acquire, bucket should be created
      service.acquire({
        userId,
        resource,
        rpm,
        burst,
        tokens: 1,
      });

      const countAfter = service.getTokenCount(userId, resource);
      expect(countAfter).toBeLessThan(burst);
    });

    it('should refill tokens when checking count', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60; // 1 token per second
      const burst = 60;

      // Consume all tokens
      for (let i = 0; i < burst; i++) {
        await service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
      }

      // Wait 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Token count should have refilled
      const count = service.getTokenCount(userId, resource);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('clearBucket', () => {
    it('should clear bucket for specific user and resource', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const rpm = 60;
      const burst = 10;

      // Consume all tokens
      for (let i = 0; i < burst; i++) {
        await service.acquire({
          userId,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
      }

      // Clear bucket
      service.clearBucket(userId, resource);

      // Should be able to acquire tokens again (bucket reset)
      await service.acquire({
        userId,
        resource,
        rpm,
        burst,
        tokens: 1,
      });

      expect(true).toBe(true);
    });
  });

  describe('clearAllBuckets', () => {
    it('should clear all buckets', async () => {
      const userId1 = 1;
      const userId2 = 2;
      const resource = 'convo_message_text';
      const rpm = 60;
      const burst = 10;

      // Consume tokens for both users
      for (let i = 0; i < burst; i++) {
        await service.acquire({
          userId: userId1,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
        await service.acquire({
          userId: userId2,
          resource,
          rpm,
          burst,
          tokens: 1,
        });
      }

      // Clear all buckets
      service.clearAllBuckets();

      // Both users should be able to acquire tokens again
      await service.acquire({
        userId: userId1,
        resource,
        rpm,
        burst,
        tokens: 1,
      });
      await service.acquire({
        userId: userId2,
        resource,
        rpm,
        burst,
        tokens: 1,
      });

      expect(true).toBe(true);
    });
  });
});
