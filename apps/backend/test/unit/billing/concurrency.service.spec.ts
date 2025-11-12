import { Test, TestingModule } from '@nestjs/testing';
import { ConcurrencyService } from '../../../src/billing/concurrency.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ConcurrencyLimitError } from '../../../src/billing/errors/billing.errors';

describe('ConcurrencyService', () => {
  let service: ConcurrencyService;
  let prisma: PrismaService;

  const mockPrismaService = {
    concurrencyLock: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Reset env vars
    process.env.CONCURRENCY_ENFORCE = 'true';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConcurrencyService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ConcurrencyService>(ConcurrencyService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();

    // Default mocks
    mockPrismaService.concurrencyLock.count.mockResolvedValue(0);
    mockPrismaService.concurrencyLock.deleteMany.mockResolvedValue({
      count: 0,
    });
  });

  afterEach(() => {
    delete process.env.CONCURRENCY_ENFORCE;
  });

  describe('acquire', () => {
    it('should acquire lock when limit not reached', async () => {
      const userId = 1;
      const resource = 'convo_stream';
      const limit = 5;
      const ttlMs = 120000; // 120 seconds

      mockPrismaService.concurrencyLock.count.mockResolvedValue(3);
      mockPrismaService.concurrencyLock.create.mockResolvedValue({
        key: 'test-lock-key',
        userId,
        resource,
        acquiredAt: new Date(),
        expiresAt: new Date(),
      });

      const result = await service.acquire({
        userId,
        resource,
        limit,
        ttlMs,
      });

      expect(result.lockKey).toBeDefined();
      expect(result.lockKey).toMatch(/^user:1:convo_stream:/);
      expect(mockPrismaService.concurrencyLock.create).toHaveBeenCalled();
    });

    it('should throw ConcurrencyLimitError when limit reached', async () => {
      const userId = 1;
      const resource = 'convo_stream';
      const limit = 5;
      const ttlMs = 120000;

      // Mock active count at limit
      mockPrismaService.concurrencyLock.count.mockResolvedValue(5);
      mockPrismaService.concurrencyLock.findFirst.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60000), // Expires in 60 seconds
      });

      await expect(
        service.acquire({
          userId,
          resource,
          limit,
          ttlMs,
        }),
      ).rejects.toThrow(ConcurrencyLimitError);

      expect(mockPrismaService.concurrencyLock.create).not.toHaveBeenCalled();
    });

    it('should calculate retryAfter based on oldest lock expiration', async () => {
      const userId = 1;
      const resource = 'convo_stream';
      const limit = 5;
      const ttlMs = 120000;

      // Mock active count at limit
      mockPrismaService.concurrencyLock.count.mockResolvedValue(5);

      // Mock oldest lock expiring in 30 seconds
      const oldestLockExpiry = new Date(Date.now() + 30000);
      mockPrismaService.concurrencyLock.findFirst.mockResolvedValue({
        expiresAt: oldestLockExpiry,
      });

      try {
        await service.acquire({
          userId,
          resource,
          limit,
          ttlMs,
        });
        fail('Should have thrown ConcurrencyLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConcurrencyLimitError);
        const retryAfter = (error as ConcurrencyLimitError).retryAfter;
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(31); // Allow some tolerance
      }
    });

    it('should not throw in log-only mode', async () => {
      // Set env var before creating new service instance
      const originalEnv = process.env.CONCURRENCY_ENFORCE;
      process.env.CONCURRENCY_ENFORCE = 'false';

      // Create new service instance with log-only mode
      const logOnlyService = new ConcurrencyService(prisma);

      const userId = 1;
      const resource = 'convo_stream';
      const limit = 5;
      const ttlMs = 120000;

      // Mock active count at limit
      mockPrismaService.concurrencyLock.count.mockResolvedValue(5);
      mockPrismaService.concurrencyLock.create.mockResolvedValue({
        key: 'test-lock-key',
        userId,
        resource,
        acquiredAt: new Date(),
        expiresAt: new Date(),
      });

      // Should not throw in log-only mode
      const result = await logOnlyService.acquire({
        userId,
        resource,
        limit,
        ttlMs,
      });

      expect(result.lockKey).toBeDefined();
      expect(mockPrismaService.concurrencyLock.create).toHaveBeenCalled();

      // Restore original env
      process.env.CONCURRENCY_ENFORCE = originalEnv;
    });

    it('should clean up expired locks before checking limit', async () => {
      const userId = 1;
      const resource = 'convo_stream';
      const limit = 5;
      const ttlMs = 120000;

      mockPrismaService.concurrencyLock.count.mockResolvedValue(3);
      mockPrismaService.concurrencyLock.create.mockResolvedValue({
        key: 'test-lock-key',
        userId,
        resource,
        acquiredAt: new Date(),
        expiresAt: new Date(),
      });

      await service.acquire({
        userId,
        resource,
        limit,
        ttlMs,
      });

      // Should call cleanup (deleteMany with expired locks)
      expect(mockPrismaService.concurrencyLock.deleteMany).toHaveBeenCalled();
    });

    it('should include metadata in lock', async () => {
      const userId = 1;
      const resource = 'convo_stream';
      const limit = 5;
      const ttlMs = 120000;
      const metadata = { customField: 'customValue' };

      mockPrismaService.concurrencyLock.count.mockResolvedValue(3);
      mockPrismaService.concurrencyLock.create.mockResolvedValue({
        key: 'test-lock-key',
        userId,
        resource,
        acquiredAt: new Date(),
        expiresAt: new Date(),
        metadata,
      });

      await service.acquire({
        userId,
        resource,
        limit,
        ttlMs,
        metadata,
      });

      expect(mockPrismaService.concurrencyLock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata,
        }),
      });
    });

    it('should generate unique lock keys', async () => {
      const userId = 1;
      const resource = 'convo_stream';
      const limit = 5;
      const ttlMs = 120000;

      mockPrismaService.concurrencyLock.count.mockResolvedValue(0);
      mockPrismaService.concurrencyLock.create
        .mockResolvedValueOnce({
          key: 'lock-key-1',
          userId,
          resource,
          acquiredAt: new Date(),
          expiresAt: new Date(),
        })
        .mockResolvedValueOnce({
          key: 'lock-key-2',
          userId,
          resource,
          acquiredAt: new Date(),
          expiresAt: new Date(),
        });

      const result1 = await service.acquire({
        userId,
        resource,
        limit,
        ttlMs,
      });

      const result2 = await service.acquire({
        userId,
        resource,
        limit,
        ttlMs,
      });

      expect(result1.lockKey).not.toBe(result2.lockKey);
    });
  });

  describe('refresh', () => {
    it('should refresh lock expiration time', async () => {
      const lockKey = 'test-lock-key';
      const ttlMs = 120000;

      const existingLock = {
        key: lockKey,
        userId: 1,
        resource: 'convo_stream',
        acquiredAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() + 60000),
        metadata: {},
      };

      mockPrismaService.concurrencyLock.findUnique.mockResolvedValue(
        existingLock,
      );
      mockPrismaService.concurrencyLock.update.mockResolvedValue({
        ...existingLock,
        expiresAt: new Date(Date.now() + ttlMs),
      });

      await service.refresh(lockKey, ttlMs);

      expect(mockPrismaService.concurrencyLock.update).toHaveBeenCalledWith({
        where: { key: lockKey },
        data: {
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should delete lock if already expired', async () => {
      const lockKey = 'test-lock-key';
      const ttlMs = 120000;

      const expiredLock = {
        key: lockKey,
        userId: 1,
        resource: 'convo_stream',
        acquiredAt: new Date(Date.now() - 180000),
        expiresAt: new Date(Date.now() - 60000), // Expired
        metadata: {},
      };

      mockPrismaService.concurrencyLock.findUnique.mockResolvedValue(
        expiredLock,
      );
      mockPrismaService.concurrencyLock.delete.mockResolvedValue(expiredLock);

      await service.refresh(lockKey, ttlMs);

      expect(mockPrismaService.concurrencyLock.delete).toHaveBeenCalledWith({
        where: { key: lockKey },
      });
      expect(mockPrismaService.concurrencyLock.update).not.toHaveBeenCalled();
    });

    it('should handle lock not found gracefully', async () => {
      const lockKey = 'nonexistent-lock-key';
      const ttlMs = 120000;

      mockPrismaService.concurrencyLock.findUnique.mockResolvedValue(null);

      await service.refresh(lockKey, ttlMs);

      expect(mockPrismaService.concurrencyLock.update).not.toHaveBeenCalled();
      expect(mockPrismaService.concurrencyLock.delete).not.toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('should release lock', async () => {
      const lockKey = 'test-lock-key';

      mockPrismaService.concurrencyLock.delete.mockResolvedValue({
        key: lockKey,
      });

      await service.release(lockKey);

      expect(mockPrismaService.concurrencyLock.delete).toHaveBeenCalledWith({
        where: { key: lockKey },
      });
    });

    it('should handle lock not found gracefully (already released)', async () => {
      const lockKey = 'nonexistent-lock-key';

      const error = new Error('Record not found');
      (error as any).code = 'P2025';
      mockPrismaService.concurrencyLock.delete.mockRejectedValue(error);

      // Should not throw
      await service.release(lockKey);

      expect(mockPrismaService.concurrencyLock.delete).toHaveBeenCalled();
    });

    it('should log error for non-P2025 errors', async () => {
      const lockKey = 'test-lock-key';

      const error = new Error('Database error');
      (error as any).code = 'P2002'; // Different error code
      mockPrismaService.concurrencyLock.delete.mockRejectedValue(error);

      // Should not throw (error is caught and logged)
      await service.release(lockKey);

      expect(mockPrismaService.concurrencyLock.delete).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredLocks', () => {
    it('should delete expired locks', async () => {
      mockPrismaService.concurrencyLock.deleteMany.mockResolvedValue({
        count: 5,
      });

      const result = await service.cleanupExpiredLocks();

      expect(result).toBe(5);
      expect(mockPrismaService.concurrencyLock.deleteMany).toHaveBeenCalledWith(
        {
          where: {
            expiresAt: {
              lt: expect.any(Date),
            },
          },
        },
      );
    });

    it('should return 0 when no expired locks', async () => {
      mockPrismaService.concurrencyLock.deleteMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.cleanupExpiredLocks();

      expect(result).toBe(0);
    });
  });

  describe('getActiveCount', () => {
    it('should return active lock count', async () => {
      const userId = 1;
      const resource = 'convo_stream';

      mockPrismaService.concurrencyLock.count.mockResolvedValue(3);

      const count = await service.getActiveCount(userId, resource);

      expect(count).toBe(3);
      expect(mockPrismaService.concurrencyLock.deleteMany).toHaveBeenCalled(); // Cleanup called first
      expect(mockPrismaService.concurrencyLock.count).toHaveBeenCalledWith({
        where: {
          userId,
          resource,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('releaseAll', () => {
    it('should release all locks for user and resource', async () => {
      const userId = 1;
      const resource = 'convo_stream';

      mockPrismaService.concurrencyLock.deleteMany.mockResolvedValue({
        count: 5,
      });

      const result = await service.releaseAll(userId, resource);

      expect(result).toBe(5);
      expect(mockPrismaService.concurrencyLock.deleteMany).toHaveBeenCalledWith(
        {
          where: {
            userId,
            resource,
          },
        },
      );
    });
  });
});
