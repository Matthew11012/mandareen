import { Test, TestingModule } from '@nestjs/testing';
import { BillingPlanService } from '../../../src/billing/billing-plan.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Logger } from '@nestjs/common';

describe('BillingPlanService', () => {
  let service: BillingPlanService;
  let prisma: PrismaService;

  const mockPrismaService = {
    userSubscription: {
      findFirst: jest.fn(),
    },
    plan: {
      findUnique: jest.fn(),
    },
  };

  beforeAll(() => {
    jest
      .spyOn(Logger.prototype as any, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn(Logger.prototype as any, 'warn')
      .mockImplementation(() => undefined);
    jest
      .spyOn(Logger.prototype as any, 'log')
      .mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingPlanService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<BillingPlanService>(BillingPlanService);
    prisma = module.get<PrismaService>(PrismaService);

    // Clear cache before each test
    service.clearAllCache();

    // Reset mocks
    jest.clearAllMocks();

    // Default mock: Return FREE plan when no active subscription (prevents error logs)
    const defaultFreePlan = {
      id: 1,
      code: 'FREE',
      name: 'Free Plan',
      description: 'Free plan description',
      periodUnit: 'monthly',
      displayPriceCents: 0,
      currency: 'USD',
      isActive: true,
      limits: [],
    };

    mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
    mockPrismaService.plan.findUnique.mockResolvedValue(defaultFreePlan);
  });

  afterEach(() => {
    service.clearAllCache();
  });

  describe('getUserPlan', () => {
    it('should return active subscription plan when user has active subscription', async () => {
      const userId = 1;
      const mockPlan = {
        id: 2,
        code: 'BASIC',
        name: 'Basic Plan',
        description: 'Basic plan description',
        periodUnit: 'monthly',
        displayPriceCents: 999,
        currency: 'USD',
        isActive: true,
        limits: [
          {
            id: 1,
            planId: 2,
            resource: 'convo_message_text',
            monthlyCap: 100,
            rpm: 10,
            burst: 20,
            concurrency: null,
          },
        ],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue({
        plan: mockPlan,
      });

      const result = await service.getUserPlan(userId);

      expect(result.plan.code).toBe('BASIC');
      expect(result.limits).toHaveLength(1);
      expect(result.limits[0].resource).toBe('convo_message_text');
      expect(mockPrismaService.userSubscription.findFirst).toHaveBeenCalledWith(
        {
          where: {
            userId,
            status: 'active',
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            plan: {
              include: {
                limits: true,
              },
            },
          },
        },
      );
      expect(mockPrismaService.plan.findUnique).not.toHaveBeenCalled();
    });

    it('should return FREE plan when user has no active subscription', async () => {
      const userId = 1;
      const mockFreePlan = {
        id: 1,
        code: 'FREE',
        name: 'Free Plan',
        description: 'Free plan description',
        periodUnit: 'monthly',
        displayPriceCents: 0,
        currency: 'USD',
        isActive: true,
        limits: [
          {
            id: 1,
            planId: 1,
            resource: 'convo_message_text',
            monthlyCap: 50,
            rpm: 5,
            burst: 10,
            concurrency: null,
          },
        ],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.plan.findUnique.mockResolvedValue(mockFreePlan);

      const result = await service.getUserPlan(userId);

      expect(result.plan.code).toBe('FREE');
      expect(result.limits).toHaveLength(1);
      expect(mockPrismaService.userSubscription.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledWith({
        where: { code: 'FREE' },
        include: { limits: true },
      });
    });

    it('should return conservative default when FREE plan not found in database', async () => {
      const userId = 1;

      mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.plan.findUnique.mockResolvedValue(null);

      const result = await service.getUserPlan(userId);

      expect(result.plan.code).toBe('FREE');
      expect(result.plan.id).toBe(0);
      expect(result.limits).toHaveLength(0);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalled();
    });

    it('should cache plan results for cache TTL duration', async () => {
      const userId = 1;
      const mockFreePlan = {
        id: 1,
        code: 'FREE',
        name: 'Free Plan',
        description: null,
        periodUnit: 'monthly',
        displayPriceCents: 0,
        currency: 'USD',
        isActive: true,
        limits: [],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.plan.findUnique.mockResolvedValue(mockFreePlan);

      // First call
      const result1 = await service.getUserPlan(userId);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(1);

      // Second call (should use cache)
      const result2 = await service.getUserPlan(userId);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(1);
      expect(result1.plan.code).toBe(result2.plan.code);
    });

    it('should refresh cache after TTL expires', async () => {
      const userId = 1;
      const mockFreePlan = {
        id: 1,
        code: 'FREE',
        name: 'Free Plan',
        description: null,
        periodUnit: 'monthly',
        displayPriceCents: 0,
        currency: 'USD',
        isActive: true,
        limits: [],
      };

      // Set a short cache TTL for testing
      const originalEnv = process.env.PLAN_CACHE_TTL_SECONDS;
      process.env.PLAN_CACHE_TTL_SECONDS = '1';

      // Create new service instance with short cache TTL
      const shortCacheService = new BillingPlanService(prisma);

      mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.plan.findUnique.mockResolvedValue(mockFreePlan);

      // First call
      await shortCacheService.getUserPlan(userId);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second call (should refresh cache)
      await shortCacheService.getUserPlan(userId);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(2);

      // Restore default
      if (originalEnv) {
        process.env.PLAN_CACHE_TTL_SECONDS = originalEnv;
      } else {
        delete process.env.PLAN_CACHE_TTL_SECONDS;
      }
    });

    it('should prioritize active subscription over FREE plan', async () => {
      const userId = 1;
      const mockSubscriptionPlan = {
        id: 3,
        code: 'PREMIUM',
        name: 'Premium Plan',
        description: null,
        periodUnit: 'monthly',
        displayPriceCents: 2999,
        currency: 'USD',
        isActive: true,
        limits: [],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue({
        plan: mockSubscriptionPlan,
      });

      const result = await service.getUserPlan(userId);

      expect(result.plan.code).toBe('PREMIUM');
      expect(mockPrismaService.plan.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getLimit', () => {
    it('should return limit for specific resource', async () => {
      const userId = 1;
      const mockPlan = {
        id: 2,
        code: 'BASIC',
        name: 'Basic Plan',
        description: null,
        periodUnit: 'monthly',
        displayPriceCents: 999,
        currency: 'USD',
        isActive: true,
        limits: [
          {
            id: 1,
            planId: 2,
            resource: 'convo_message_text',
            monthlyCap: 100,
            rpm: 10,
            burst: 20,
            concurrency: null,
          },
          {
            id: 2,
            planId: 2,
            resource: 'lesson_custom_generated',
            monthlyCap: 50,
            rpm: 5,
            burst: 10,
            concurrency: null,
          },
        ],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue({
        plan: mockPlan,
      });

      const limit = await service.getLimit(userId, 'convo_message_text');

      expect(limit).not.toBeNull();
      expect(limit?.resource).toBe('convo_message_text');
      expect(limit?.monthlyCap).toBe(100);
    });

    it('should return null when limit not found', async () => {
      const userId = 1;
      const mockPlan = {
        id: 1,
        code: 'FREE',
        name: 'Free Plan',
        description: null,
        periodUnit: 'monthly',
        displayPriceCents: 0,
        currency: 'USD',
        isActive: true,
        limits: [],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.plan.findUnique.mockResolvedValue(mockPlan);

      const limit = await service.getLimit(userId, 'nonexistent_resource');

      expect(limit).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific user', async () => {
      const userId = 1;
      const mockFreePlan = {
        id: 1,
        code: 'FREE',
        name: 'Free Plan',
        description: null,
        periodUnit: 'monthly',
        displayPriceCents: 0,
        currency: 'USD',
        isActive: true,
        limits: [],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.plan.findUnique.mockResolvedValue(mockFreePlan);

      // Populate cache
      await service.getUserPlan(userId);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache(userId);

      // Next call should hit DB again
      await service.getUserPlan(userId);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAllCache', () => {
    it('should clear all cached plans', async () => {
      const userId1 = 1;
      const userId2 = 2;
      const mockFreePlan = {
        id: 1,
        code: 'FREE',
        name: 'Free Plan',
        description: null,
        periodUnit: 'monthly',
        displayPriceCents: 0,
        currency: 'USD',
        isActive: true,
        limits: [],
      };

      mockPrismaService.userSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.plan.findUnique.mockResolvedValue(mockFreePlan);

      // Populate cache for two users
      await service.getUserPlan(userId1);
      await service.getUserPlan(userId2);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(2);

      // Clear all cache
      service.clearAllCache();

      // Next calls should hit DB again
      await service.getUserPlan(userId1);
      await service.getUserPlan(userId2);
      expect(mockPrismaService.plan.findUnique).toHaveBeenCalledTimes(4);
    });
  });
});
