import { Test, TestingModule } from '@nestjs/testing';
import { PolarAdapter } from '../../../src/billing/polar.adapter';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { Logger } from '@nestjs/common';

describe('PolarAdapter', () => {
  let adapter: PolarAdapter;
  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      switch (key) {
        case 'POLAR_API_KEY':
          return 'test-api-key';
        case 'POLAR_WEBHOOK_SECRET':
          return 'test-secret';
        case 'POLAR_API_BASE_URL':
          return 'https://api.polar.sh';
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
      PolarAdapter,
      {
        provide: HttpService,
        useValue: mockHttpService,
      },
      {
        provide: ConfigService,
        useValue: mockConfigService,
      },
    ],
  }).compile();

  adapter = module.get<PolarAdapter>(PolarAdapter);
  jest.clearAllMocks();
});

  describe('verifySignature', () => {
    it('returns true for valid signature (utf8 secret)', () => {
      const body = Buffer.from(JSON.stringify({ event_id: 'evt_123' }), 'utf-8');
      const webhookId = 'wh_123';
      const timestamp = '1700000000';
      const signedPayload = `${webhookId}.${timestamp}.${body.toString('utf-8')}`;

      const hmac = require('crypto')
        .createHmac('sha256', Buffer.from('test-secret', 'utf-8'))
        .update(signedPayload)
        .digest('base64');

      const result = adapter.verifySignature(body, {
        'webhook-signature': `v1,${hmac}`,
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
      });

      expect(result).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const body = Buffer.from('{}', 'utf-8');
      const result = adapter.verifySignature(body, {
        'webhook-signature': 'invalid',
        'webhook-id': 'wh_123',
        'webhook-timestamp': '1700000000',
      });

      expect(result).toBe(false);
    });
  });

  describe('extractCustomer', () => {
    it('extracts customer data from payload', () => {
      const payload = {
        data: {
          id: 'cust_123',
          email: 'customer@example.com',
          external_id: 'usr_1',
          metadata: { key: 'value' },
        },
      };

      const result = adapter.extractCustomer(payload);

      expect(result).toEqual({
        externalCustomerId: 'cust_123',
        email: 'customer@example.com',
        externalId: 'usr_1',
        metadata: { key: 'value' },
      });
    });

    it('throws when customer id missing', () => {
      expect(() => adapter.extractCustomer({ data: {} })).toThrow(
        'Customer ID not found in webhook payload',
      );
    });
  });

  describe('extractSubscription', () => {
    it('extracts subscription data', () => {
      const now = new Date().toISOString();
      const payload = {
        data: {
          id: 'sub_123',
          customer_id: 'cust_123',
          product_id: 'prod_123',
          prices: [{ id: 'price_123' }],
          status: 'active',
          current_period_start: now,
          current_period_end: now,
          cancel_at_period_end: false,
          trial_end: now,
        },
      };

      const result = adapter.extractSubscription(payload);

      expect(result).toMatchObject({
        externalSubscriptionId: 'sub_123',
        externalCustomerId: 'cust_123',
        externalProductId: 'prod_123',
        externalPriceId: 'price_123',
        status: 'active',
        cancelAtPeriodEnd: false,
      });
      expect(result.currentPeriodStart).toBeInstanceOf(Date);
      expect(result.currentPeriodEnd).toBeInstanceOf(Date);
      expect(result.trialEnd).toBeInstanceOf(Date);
    });

    it('throws when required fields missing', () => {
      expect(() => adapter.extractSubscription({ data: { id: null } })).toThrow(
        'Subscription ID not found in webhook payload',
      );
    });
  });

  describe('createCustomer', () => {
    it('creates customer and returns external id', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            id: 'cust_123',
          },
        }),
      );

      const result = await adapter.createCustomer({
        email: 'customer@example.com',
        externalId: 'usr_1',
        metadata: { key: 'value' },
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.polar.sh/v1/customers',
        {
          email: 'customer@example.com',
          external_id: 'usr_1',
          metadata: { key: 'value' },
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
      expect(result).toEqual({ externalCustomerId: 'cust_123' });
    });

    it('throws on API error', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => ({
          message: 'Request failed',
          response: { data: { error: 'invalid' } },
        })),
      );

      await expect(
        adapter.createCustomer({ email: 'customer@example.com' }),
      ).rejects.toThrow('Failed to create Polar customer: Request failed');
    });
  });

  describe('createCheckout', () => {
    it('creates checkout session with products array', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            url: 'https://checkout.polar.sh/session/abc',
          },
        }),
      );

      const result = await adapter.createCheckout({
        productIds: ['prod_1'],
        externalCustomerId: 'cust_1',
        metadata: { planCode: 'BASIC' },
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.polar.sh/v1/checkouts/',
        {
          products: ['prod_1'],
          external_customer_id: 'cust_1',
          metadata: { planCode: 'BASIC' },
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        },
        expect.any(Object),
      );
      expect(result).toEqual({ url: 'https://checkout.polar.sh/session/abc' });
    });
  });

  describe('createCustomerSession', () => {
    it('returns token and portal url', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            token: 'token_123',
            customer_portal_url: 'https://polar.sh/portal?token=token_123',
          },
        }),
      );

      const result = await adapter.createCustomerSession('cust_1');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.polar.sh/v1/customer-sessions/',
        { customer_id: 'cust_1' },
        expect.any(Object),
      );
      expect(result).toEqual({
        token: 'token_123',
        customerPortalUrl: 'https://polar.sh/portal?token=token_123',
      });
    });
  });
});

