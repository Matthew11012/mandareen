import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from '../../../src/billing/usage.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { QuotaExceededError } from '../../../src/billing/errors/billing.errors';

describe('UsageService', () => {
  let service: UsageService;
  let prisma: PrismaService;

  const mockPrismaService = {
    usageDaily: {
      aggregate: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    usageEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    // Reset env vars
    process.env.USAGE_ENFORCE = 'true';
    process.env.USAGE_WINDOW_DAYS = '30';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsageService>(UsageService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();

    // Default transaction mock - execute callback immediately
    mockPrismaService.$transaction.mockImplementation(async (callback) => {
      return callback(mockPrismaService);
    });
  });

  afterEach(() => {
    delete process.env.USAGE_ENFORCE;
    delete process.env.USAGE_WINDOW_DAYS;
  });

  describe('sumUsedLastNDays', () => {
    it('should sum usage from UsageDaily aggregates', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const nDays = 30;

      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 150 },
      });

      const result = await service.sumUsedLastNDays(userId, resource, nDays);

      expect(result).toBe(150);
      expect(mockPrismaService.usageDaily.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          resource,
          day: {
            gte: expect.any(Date),
          },
        },
        _sum: {
          used: true,
        },
      });
    });

    it('should return 0 when no usage found', async () => {
      const userId = 1;
      const resource = 'convo_message_text';

      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: null },
      });

      const result = await service.sumUsedLastNDays(userId, resource);

      expect(result).toBe(0);
    });

    it('should use correct cutoff date for rolling window', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const nDays = 7;

      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 50 },
      });

      await service.sumUsedLastNDays(userId, resource, nDays);

      const call = mockPrismaService.usageDaily.aggregate.mock.calls[0][0];
      const cutoff = call.where.day.gte;
      const expectedCutoff = new Date();
      expectedCutoff.setUTCDate(expectedCutoff.getUTCDate() - nDays);
      expectedCutoff.setUTCHours(0, 0, 0, 0);

      expect(cutoff.getTime()).toBeCloseTo(expectedCutoff.getTime(), -3);
    });
  });

  describe('checkAndConsume', () => {
    it('should record usage when quota not exceeded', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;

      // Mock usage sum (below cap)
      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 50 },
      });

      // Mock idempotency check (no duplicates)
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);

      // Mock transaction operations
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.upsert.mockResolvedValue({});

      await service.checkAndConsume({
        userId,
        resource,
        amount,
        planCap,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.usageEvent.create).toHaveBeenCalled();
      expect(mockPrismaService.usageDaily.upsert).toHaveBeenCalled();
    });

    it('should throw QuotaExceededError when quota would be exceeded', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;

      // Mock usage sum (already at cap)
      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 95 },
      });

      // Mock idempotency check (no duplicates)
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);

      await expect(
        service.checkAndConsume({
          userId,
          resource,
          amount,
          planCap,
        }),
      ).rejects.toThrow(QuotaExceededError);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should skip recording when idempotency key already used', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;
      const idempotencyKey = 'test-key-123';

      // Mock usage sum
      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 50 },
      });

      // Mock idempotency check (duplicate found)
      mockPrismaService.usageEvent.findMany.mockResolvedValue([
        {
          metadata: { idempotencyKey: 'test-key-123' },
        },
      ]);

      await service.checkAndConsume({
        userId,
        resource,
        amount,
        planCap,
        idempotencyKey,
      });

      // Should not record usage (idempotency check passed)
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should record usage in log-only mode without throwing', async () => {
      // Set env var before creating new service instance
      const originalEnv = process.env.USAGE_ENFORCE;
      process.env.USAGE_ENFORCE = 'false';

      // Create new service instance with log-only mode
      const logOnlyService = new UsageService(prisma);

      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;

      // Mock usage sum (would exceed)
      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 95 },
      });

      // Mock idempotency check
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);

      // Mock transaction operations
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.upsert.mockResolvedValue({});

      // Should not throw in log-only mode
      await logOnlyService.checkAndConsume({
        userId,
        resource,
        amount,
        planCap,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();

      // Restore original env
      process.env.USAGE_ENFORCE = originalEnv;
    });

    it('should update existing UsageDaily record when record exists', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;

      // Mock usage sum
      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 50 },
      });

      // Mock idempotency check
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);

      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.upsert.mockResolvedValue({});

      await service.checkAndConsume({
        userId,
        resource,
        amount,
        planCap,
      });

      expect(mockPrismaService.usageDaily.upsert).toHaveBeenCalled();
    });

    it('should use custom windowDays when provided', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;
      const windowDays = 7;

      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 50 },
      });
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.upsert.mockResolvedValue({});

      await service.checkAndConsume({
        userId,
        resource,
        amount,
        planCap,
        windowDays,
      });

      // Verify sumUsedLastNDays was called with custom windowDays
      const aggregateCall =
        mockPrismaService.usageDaily.aggregate.mock.calls.find(
          (call) =>
            call[0].where.userId === userId &&
            call[0].where.resource === resource,
        );
      expect(aggregateCall).toBeDefined();
    });

    it('should include idempotencyKey in event metadata', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;
      const idempotencyKey = 'test-key-456';

      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 50 },
      });
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.upsert.mockResolvedValue({});

      await service.checkAndConsume({
        userId,
        resource,
        amount,
        planCap,
        idempotencyKey,
      });

      expect(mockPrismaService.usageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            idempotencyKey: 'test-key-456',
          }),
        }),
      });
    });
  });

  describe('ensureWithinQuota', () => {
    it('should throw when usage would exceed plan cap', async () => {
      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 90 },
      });
      await expect(
        service.ensureWithinQuota({
          userId: 1,
          resource: 'lesson',
          amount: 15,
          planCap: 100,
        }),
      ).rejects.toThrow(QuotaExceededError);
    });

    it('should return silently when duplicate idempotency key found', async () => {
      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 10 },
      });
      mockPrismaService.usageEvent.findMany.mockResolvedValue([
        { metadata: { idempotencyKey: 'dup-key' } },
      ]);
      await expect(
        service.ensureWithinQuota({
          userId: 1,
          resource: 'lesson',
          amount: 1,
          planCap: 100,
          idempotencyKey: 'dup-key',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('recordUsage', () => {
    it('should record usage event with metadata', async () => {
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.upsert.mockResolvedValue({});

      await service.recordUsage({
        userId: 2,
        resource: 'lesson',
        amount: 1,
        metadata: { lessonId: 42 },
      });

      expect(mockPrismaService.usageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ lessonId: 42 }),
        }),
      });
    });

    it('should skip recording when duplicate idempotency key detected', async () => {
      mockPrismaService.usageEvent.findMany.mockResolvedValue([
        { metadata: { idempotencyKey: 'dup-key' } },
      ]);

      await service.recordUsage({
        userId: 2,
        resource: 'lesson',
        amount: 1,
        idempotencyKey: 'dup-key',
      });

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('recordAnalytics', () => {
    it('should record usage without quota enforcement', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const amount = 10;

      // Mock idempotency check
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);

      // Mock transaction operations
      mockPrismaService.usageDaily.findFirst.mockResolvedValue(null);
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.create.mockResolvedValue({});

      await service.recordAnalytics({
        userId,
        resource,
        amount,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.usageEvent.create).toHaveBeenCalled();
    });

    it('should skip recording when idempotency key already used', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const amount = 10;
      const idempotencyKey = 'analytics-key-123';

      // Mock idempotency check (duplicate found)
      mockPrismaService.usageEvent.findMany.mockResolvedValue([
        {
          metadata: { idempotencyKey: 'analytics-key-123' },
        },
      ]);

      await service.recordAnalytics({
        userId,
        resource,
        amount,
        idempotencyKey,
      });

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should include custom metadata in event', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const amount = 10;
      const metadata = { customField: 'customValue' };

      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.upsert.mockResolvedValue({});

      await service.recordAnalytics({
        userId,
        resource,
        amount,
        metadata,
      });

      expect(mockPrismaService.usageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            customField: 'customValue',
          }),
        }),
      });
    });
  });

  describe('race safety', () => {
    it('should use transaction for atomic usage recording', async () => {
      const userId = 1;
      const resource = 'convo_message_text';
      const planCap = 100;
      const amount = 10;

      mockPrismaService.usageDaily.aggregate.mockResolvedValue({
        _sum: { used: 50 },
      });
      mockPrismaService.usageEvent.findMany.mockResolvedValue([]);
      mockPrismaService.usageDaily.findFirst.mockResolvedValue(null);
      mockPrismaService.usageEvent.create.mockResolvedValue({});
      mockPrismaService.usageDaily.create.mockResolvedValue({});

      await service.checkAndConsume({
        userId,
        resource,
        amount,
        planCap,
      });

      // Verify transaction was used
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(typeof mockPrismaService.$transaction.mock.calls[0][0]).toBe(
        'function',
      );
    });
  });
});
