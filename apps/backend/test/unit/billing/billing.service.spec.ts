import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from '../../../src/billing/billing.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PolarAdapter } from '../../../src/billing/polar.adapter';
import { ConfigService } from '@nestjs/config';
import { CheckoutError } from '../../../src/billing/errors/billing.errors';
import { NotFoundException, Logger } from '@nestjs/common';

describe('BillingService', () => {
  let service: BillingService;
  const mockPrisma = {
    planPrice: {
      findUnique: jest.fn(),
    },
    plan: {
      findUnique: jest.fn(),
    },
    billingCustomer: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockPolarAdapter = {
    createCustomer: jest.fn(),
    createCheckout: jest.fn(),
    createCustomerSession: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      switch (key) {
        case 'BILLING_PROVIDER':
          return 'polar';
        case 'BILLING_PORTAL_URL':
          return undefined;
        case 'FRONTEND_URL':
          return 'https://mandareen.app';
        default:
          return defaultValue;
      }
    }),
  };

  beforeAll(() => {
    jest.spyOn(Logger.prototype as any, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype as any, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype as any, 'log').mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: PolarAdapter,
          useValue: mockPolarAdapter,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    jest.clearAllMocks();
  });

  describe('resolvePlanFromProduct', () => {
    it('returns plan when plan price is active', async () => {
      mockPrisma.planPrice.findUnique.mockResolvedValue({
        planId: 10,
        isActive: true,
        plan: {
          code: 'PRO',
          isActive: true,
        },
      });

      const result = await service.resolvePlanFromProduct('prod_123');

      expect(mockPrisma.planPrice.findUnique).toHaveBeenCalledWith({
        where: {
          provider_externalPriceId: {
            provider: 'polar',
            externalPriceId: 'prod_123',
          },
        },
        include: {
          plan: true,
        },
      });
      expect(result).toEqual({ planId: 10, planCode: 'PRO' });
    });

    it('throws NotFound when plan price missing', async () => {
      mockPrisma.planPrice.findUnique.mockResolvedValue(null);

      await expect(service.resolvePlanFromProduct('prod_missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws CheckoutError when plan price inactive', async () => {
      mockPrisma.planPrice.findUnique.mockResolvedValue({
        isActive: false,
        plan: { isActive: true },
      });

      await expect(service.resolvePlanFromProduct('prod_inactive')).rejects.toBeInstanceOf(
        CheckoutError,
      );
    });
  });

  describe('ensureBillingCustomer', () => {
    it('returns existing billing customer', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        externalCustomerId: 'cust_existing',
      });

      const result = await service.ensureBillingCustomer(1, 'user@example.com');

      expect(mockPrisma.billingCustomer.findUnique).toHaveBeenCalled();
      expect(result).toEqual({ externalCustomerId: 'cust_existing' });
      expect(mockPolarAdapter.createCustomer).not.toHaveBeenCalled();
    });

    it('creates customer when missing', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);
      mockPolarAdapter.createCustomer.mockResolvedValue({
        externalCustomerId: 'cust_new',
      });
      mockPrisma.billingCustomer.create.mockResolvedValue({});

      const result = await service.ensureBillingCustomer(5, 'new@example.com');

      expect(mockPolarAdapter.createCustomer).toHaveBeenCalledWith({
        email: 'new@example.com',
        externalId: '5',
        metadata: {
          userId: '5',
        },
      });
      expect(mockPrisma.billingCustomer.create).toHaveBeenCalledWith({
        data: {
          userId: 5,
          provider: 'polar',
          externalCustomerId: 'cust_new',
        },
      });
      expect(result).toEqual({ externalCustomerId: 'cust_new' });
    });
  });

  describe('createCheckout', () => {
    it('creates checkout session and returns URL', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue({
        code: 'PRO',
        isActive: true,
        prices: [
          {
            provider: 'polar',
            billingPeriod: 'monthly',
            isActive: true,
            externalPriceId: 'prod_123',
          },
        ],
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'user@example.com',
      });
      jest
        .spyOn(service, 'ensureBillingCustomer')
        .mockResolvedValue({ externalCustomerId: 'cust_123' });
      mockPolarAdapter.createCheckout.mockResolvedValue({
        url: 'https://checkout.polar.sh/session/123',
      });

      const result = await service.createCheckout(1, 'PRO');

      expect(service.ensureBillingCustomer).toHaveBeenCalledWith(
        1,
        'user@example.com',
      );
      expect(mockPolarAdapter.createCheckout).toHaveBeenCalledWith({
        productIds: ['prod_123'],
        externalCustomerId: 'cust_123',
        metadata: {
          userId: '1',
          planCode: 'PRO',
          billingPeriod: 'monthly',
        },
        successUrl:
          'https://mandareen.app/billing/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://mandareen.app/billing/cancel',
      });
      expect(result).toEqual({
        url: 'https://checkout.polar.sh/session/123',
      });
    });

    it('throws when plan not found', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue(null);

      await expect(service.createCheckout(1, 'MISSING')).rejects.toBeInstanceOf(
        CheckoutError,
      );
    });
  });
});

