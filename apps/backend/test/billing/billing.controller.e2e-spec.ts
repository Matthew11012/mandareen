import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { BillingService } from '../../src/billing/billing.service';
import { AuthGuard } from '../../src/auth/guards/auth.guard';
import {
  CheckoutError,
  PortalUnavailableError,
} from '../../src/billing/errors/billing.errors';

describe('BillingController (e2e)', () => {
  let app: INestApplication;
  const billingServiceMock = {
    createCheckout: jest.fn(),
    getBillingPortalUrl: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BillingService)
      .useValue(billingServiceMock)
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 42 };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/billing/checkout', () => {
    it('returns checkout URL for valid request', async () => {
      billingServiceMock.createCheckout.mockResolvedValue({
        url: 'https://checkout.polar.sh/session/abc',
      });

      const response = await supertest(app.getHttpServer())
        .post('/api/billing/checkout')
        .send({
          planCode: 'PRO',
        })
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        url: 'https://checkout.polar.sh/session/abc',
      });
      expect(billingServiceMock.createCheckout).toHaveBeenCalledWith(
        42,
        'PRO',
        'monthly',
      );
    });

    it('honors billing period override', async () => {
      billingServiceMock.createCheckout.mockResolvedValue({
        url: 'https://checkout.polar.sh/session/yearly',
      });

      await supertest(app.getHttpServer())
        .post('/api/billing/checkout')
        .send({
          planCode: 'PRO',
          billingPeriod: 'yearly',
        })
        .expect(HttpStatus.OK);

      expect(billingServiceMock.createCheckout).toHaveBeenCalledWith(
        42,
        'PRO',
        'yearly',
      );
    });

    it('surfaces checkout errors from service', async () => {
      billingServiceMock.createCheckout.mockRejectedValue(
        new CheckoutError(
          'Plan not found',
          HttpStatus.NOT_FOUND,
          'Plan missing',
        ),
      );

      const response = await supertest(app.getHttpServer())
        .post('/api/billing/checkout')
        .send({
          planCode: 'UNKNOWN',
        })
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.code).toBe('CHECKOUT_ERROR');
      expect(response.body.message).toBe('Plan missing');
    });
  });

  describe('GET /api/billing/portal', () => {
    it('returns portal URL from service', async () => {
      billingServiceMock.getBillingPortalUrl.mockResolvedValue({
        url: 'https://polar.sh/portal?token=123',
      });

      const response = await supertest(app.getHttpServer())
        .get('/api/billing/portal')
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        url: 'https://polar.sh/portal?token=123',
      });
      expect(billingServiceMock.getBillingPortalUrl).toHaveBeenCalledWith(42);
    });

    it('returns 404 when portal unavailable', async () => {
      billingServiceMock.getBillingPortalUrl.mockRejectedValue(
        new PortalUnavailableError('Portal disabled'),
      );

      const response = await supertest(app.getHttpServer())
        .get('/api/billing/portal')
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.code).toBe('PORTAL_UNAVAILABLE');
      expect(response.body.message).toBe('Portal disabled');
    });
  });
});
