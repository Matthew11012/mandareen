import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import * as crypto from 'crypto';

describe('BillingWebhookController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const webhookSecret = 'test-webhook-secret';
  const provider = 'polar';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        billingEvent: {
          create: jest.fn(),
          findUnique: jest.fn(),
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to generate StandardWebhooks signature
  function generateSignature(
    body: string,
    webhookId: string,
    timestamp: string,
    secret: string,
  ): string {
    const signedPayload = `${webhookId}.${timestamp}.${body}`;
    const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'base64'));
    hmac.update(signedPayload);
    return hmac.digest('base64');
  }

  describe('POST /api/billing/webhooks/polar', () => {
    it('should reject webhook with invalid signature', async () => {
      const payload = { event_id: 'test-1', event_type: 'customer.created' };
      const body = JSON.stringify(payload);
      const webhookId = 'webhook-123';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      return request(app.getHttpServer())
        .post('/api/billing/webhooks/polar')
        .set('webhook-signature', 'invalid-signature')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .send(payload)
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toBe('Invalid signature');
        });
    });

    it('should accept webhook with valid signature', async () => {
      const payload = {
        event_id: 'test-2',
        event_type: 'customer.created',
        data: { object: { id: 'cust-123', email: 'test@example.com' } },
      };
      const body = JSON.stringify(payload);
      const webhookId = 'webhook-456';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(
        body,
        webhookId,
        timestamp,
        Buffer.from(webhookSecret).toString('base64'),
      );

      jest.spyOn(prisma.billingEvent, 'create').mockResolvedValue({
        id: 1,
        provider,
        eventId: payload.event_id,
        type: payload.event_type,
        payload: payload as any,
        status: 'pending',
        receivedAt: new Date(),
        processedAt: null,
      } as any);

      return request(app.getHttpServer())
        .post('/api/billing/webhooks/polar')
        .set('webhook-signature', signature)
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .send(payload)
        .expect(200)
        .expect((res) => {
          expect(res.body.received).toBe(true);
          expect(res.body.eventId).toBe(payload.event_id);
        });
    });

    it('should handle idempotent webhook events', async () => {
      const payload = {
        event_id: 'test-3',
        event_type: 'subscription.active',
      };
      const body = JSON.stringify(payload);
      const webhookId = 'webhook-789';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(
        body,
        webhookId,
        timestamp,
        Buffer.from(webhookSecret).toString('base64'),
      );

      // Mock existing processed event
      jest.spyOn(prisma.billingEvent, 'create').mockRejectedValue({
        code: 'P2002', // Unique constraint violation
      });
      jest.spyOn(prisma.billingEvent, 'findUnique').mockResolvedValue({
        id: 1,
        provider,
        eventId: payload.event_id,
        type: payload.event_type,
        payload: payload as any,
        status: 'processed',
        receivedAt: new Date(),
        processedAt: new Date(),
      } as any);

      return request(app.getHttpServer())
        .post('/api/billing/webhooks/polar')
        .set('webhook-signature', signature)
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .send(payload)
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('already_processed');
        });
    });
  });
});


