import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BillingWebhookService } from '../../../src/billing/billing.webhook.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PolarAdapter } from '../../../src/billing/polar.adapter';
import { BillingService } from '../../../src/billing/billing.service';
import { Logger } from '@nestjs/common';

describe('BillingWebhookService', () => {
  let service: BillingWebhookService;
  let prisma: PrismaService;
  let polarAdapter: PolarAdapter;
  let billingService: BillingService;

  const mockPrisma = {
    billingEvent: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    billingCustomer: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    userSubscription: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockPolarAdapter = {
    extractCustomer: jest.fn(),
    extractSubscription: jest.fn(),
  };

  const mockBillingService = {
    resolvePlanFromProduct: jest.fn(),
  };

  beforeAll(() => {
    jest.spyOn(Logger.prototype as any, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype as any, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype as any, 'log').mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingWebhookService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: PolarAdapter,
          useValue: mockPolarAdapter,
        },
        {
          provide: BillingService,
          useValue: mockBillingService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'BILLING_PROVIDER') return 'polar';
              if (key === 'BILLING_ENFORCE') return 'true';
              if (key === 'BILLING_LOG_ONLY') return 'false';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BillingWebhookService>(BillingWebhookService);
    prisma = module.get<PrismaService>(PrismaService);
    polarAdapter = module.get<PolarAdapter>(PolarAdapter);
    billingService = module.get<BillingService>(BillingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    (service as any).logOnly = false;
    (service as any).enforce = true;
  });

  describe('process', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (callback) =>
        callback(mockPrisma),
      );
    });

    it('should skip already processed events', async () => {
      mockPrisma.billingEvent.findUnique.mockResolvedValue({
        id: 1,
        provider: 'polar',
        eventId: 'event-1',
        type: 'customer.created',
        payload: {},
        status: 'processed',
      });

      const result = await service.process('event-1');

      expect(result.processed).toBe(false);
      expect(result.status).toBe('processed');
      expect(mockPrisma.billingEvent.update).not.toHaveBeenCalled();
    });

    it('should skip previously failed events', async () => {
      mockPrisma.billingEvent.findUnique.mockResolvedValue({
        id: 1,
        provider: 'polar',
        eventId: 'event-0',
        type: 'customer.created',
        payload: {},
        status: 'failed',
      });

      const result = await service.process('event-0');

      expect(result.processed).toBe(false);
      expect(result.status).toBe('failed');
      expect(mockPrisma.billingEvent.update).not.toHaveBeenCalled();
    });

    it('should process pending events', async () => {
      mockPrisma.billingEvent.findUnique.mockResolvedValue({
        id: 1,
        provider: 'polar',
        eventId: 'event-2',
        type: 'customer.created',
        payload: { data: { object: { id: 'cust-1' } } },
        status: 'pending',
      });

      mockPolarAdapter.extractCustomer.mockReturnValue({
        externalCustomerId: 'cust-1',
        email: 'test@example.com',
        externalId: '1',
      });

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.billingCustomer.upsert.mockResolvedValue({});
      mockPrisma.billingEvent.update.mockResolvedValue({});

      const result = await service.process('event-2');

      expect(result.processed).toBe(true);
      expect(result.status).toBe('processed');
    });
  });

  describe('mapSubscriptionStatus', () => {
    it('should map subscription.active event to active status', async () => {
      // Test via onSubscriptionChange
      mockPrisma.billingEvent.findUnique.mockResolvedValue({
        id: 1,
        provider: 'polar',
        eventId: 'event-3',
        type: 'subscription.active',
        payload: {},
        status: 'pending',
      });

      mockPolarAdapter.extractSubscription.mockReturnValue({
        externalSubscriptionId: 'sub-1',
        externalCustomerId: 'cust-1',
        externalProductId: 'prod-1',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      });

      mockBillingService.resolvePlanFromProduct.mockResolvedValue({
        planId: 1,
        planCode: 'BASIC',
      });

      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        provider: 'polar',
        externalCustomerId: 'cust-1',
      });

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      mockPrisma.userSubscription.findMany.mockResolvedValue([]);
      mockPrisma.userSubscription.findFirst.mockResolvedValue(null);
      mockPrisma.userSubscription.create.mockResolvedValue({});

      await service.process('event-3');

      expect(mockPrisma.userSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'active',
          }),
        }),
      );
    });

    it('should update subscription to canceled on subscription.canceled event', async () => {
      mockPrisma.billingEvent.findUnique.mockResolvedValue({
        id: 2,
        provider: 'polar',
        eventId: 'event-4',
        type: 'subscription.canceled',
        payload: {},
        status: 'pending',
      });

      mockPolarAdapter.extractSubscription.mockReturnValue({
        externalSubscriptionId: 'sub-2',
        externalCustomerId: 'cust-2',
        externalProductId: 'prod-2',
        status: 'canceled',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: true,
      });

      mockBillingService.resolvePlanFromProduct.mockResolvedValue({
        planId: 2,
        planCode: 'BASIC',
      });

      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 2,
        userId: 2,
        provider: 'polar',
        externalCustomerId: 'cust-2',
      });

      mockPrisma.userSubscription.findMany.mockResolvedValue([]);
      mockPrisma.userSubscription.findFirst.mockResolvedValue({
        id: 42,
      });
      mockPrisma.userSubscription.update.mockResolvedValue({});

      await service.process('event-4');

      expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: expect.objectContaining({
          status: 'canceled',
          cancelAtPeriodEnd: true,
        }),
      });
    });

    it('should respect log-only mode for subscription events', async () => {
      mockPrisma.billingEvent.findUnique.mockResolvedValue({
        id: 3,
        provider: 'polar',
        eventId: 'event-5',
        type: 'subscription.active',
        payload: {},
        status: 'pending',
      });

      mockPolarAdapter.extractSubscription.mockReturnValue({
        externalSubscriptionId: 'sub-3',
        externalCustomerId: 'cust-3',
        externalProductId: 'prod-3',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      });

      // Enable log-only mode
      (service as any).logOnly = true;

      await service.process('event-5');

      expect(mockBillingService.resolvePlanFromProduct).not.toHaveBeenCalled();
      expect(mockPrisma.userSubscription.create).not.toHaveBeenCalled();
      expect(mockPrisma.userSubscription.update).not.toHaveBeenCalled();
      expect(mockPrisma.billingEvent.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: expect.objectContaining({
          status: 'processed',
        }),
      });
    });
  });
});


