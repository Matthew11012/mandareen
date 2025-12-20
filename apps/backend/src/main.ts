import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';
import { NestExpressApplication } from '@nestjs/platform-express';
import { EmailService } from './email/email.service';
import { createAuthConfig } from './auth/lib/auth';
import { toNodeHandler } from 'better-auth/node';
import { PolarAdapter } from './billing/polar.adapter';
import { BillingWebhookService } from './billing/billing.webhook.service';
import { PrismaService } from './prisma/prisma.service';
import cors from 'cors';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  // Force Express adapter; Better Auth community integration relies on Express.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // Better Auth requires full control of body parsing
  });

  // Early health check for /auth/ping to verify ingress reaches this service
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance?.();
  // Try to grab BetterAuthService to expose simple express-level fallbacks
  // (helps when framework-level mounting is flaky in certain deploys)
  const betterAuthService = app.get<BetterAuthService>(BetterAuthService, {
    strict: false,
  });
  const polarAdapter = app.get(PolarAdapter, { strict: false });
  const billingWebhookService = app.get(BillingWebhookService, {
    strict: false,
  });
  const prisma = app.get(PrismaService, { strict: false });

  // Ensure Polar webhooks receive the raw body for signature verification while still parsing JSON.
  // This is route-scoped to avoid interfering with Better Auth/body parser settings elsewhere.
  if (instance?.use) {
    instance.use(
      '/billing/webhooks/polar',
      express.raw({
        type: 'application/json',
        limit: '1mb',
        verify: (req: any, _res, buf) => {
          req.rawBody = Buffer.from(buf);
        },
      }),
      (req: any, _res: any, next: any) => {
        // Parse JSON manually because express.raw leaves req.body as a Buffer
        if (Buffer.isBuffer(req.body)) {
          try {
            req.body =
              req.body.length > 0 ? JSON.parse(req.body.toString('utf-8')) : {};
          } catch (err) {
            console.error('Failed to parse webhook JSON body', err);
            req.body = {};
          }
        }
        next();
      },
    );
    // Also cover deployments that add a global /api prefix in front of routes.
    instance.use(
      '/api/billing/webhooks/polar',
      express.raw({
        type: 'application/json',
        limit: '1mb',
        verify: (req: any, _res, buf) => {
          req.rawBody = Buffer.from(buf);
        },
      }),
      (req: any, _res: any, next: any) => {
        if (Buffer.isBuffer(req.body)) {
          try {
            req.body =
              req.body.length > 0 ? JSON.parse(req.body.toString('utf-8')) : {};
          } catch (err) {
            console.error('Failed to parse webhook JSON body', err);
            req.body = {};
          }
        }
        next();
      },
    );
  }

  // Express-level Polar webhook handler to avoid any guard/middleware that could return 401.
  if (instance?.post && polarAdapter && billingWebhookService && prisma) {
    const handlePolar = async (req: any, res: any) => {
      try {
        const rawBody: Buffer | undefined = req.rawBody;
        if (!rawBody) {
          return res.status(400).json({
            error: 'Invalid signature',
            message:
              'Raw body is not available. Ensure raw body middleware is applied.',
          });
        }

        const webhookHeaders = {
          'webhook-signature':
            req.headers['webhook-signature'] ||
            req.headers['x-webhook-signature'] ||
            req.headers['polar-webhook-signature'] ||
            req.headers['Webhook-Signature'],
          'webhook-id':
            req.headers['webhook-id'] ||
            req.headers['x-webhook-id'] ||
            req.headers['polar-webhook-id'] ||
            req.headers['Webhook-Id'],
          'webhook-timestamp':
            req.headers['webhook-timestamp'] ||
            req.headers['x-webhook-timestamp'] ||
            req.headers['polar-webhook-timestamp'] ||
            req.headers['Webhook-Timestamp'],
        } as Record<string, string | undefined>;

        if (
          !webhookHeaders['webhook-signature'] ||
          !webhookHeaders['webhook-id'] ||
          !webhookHeaders['webhook-timestamp']
        ) {
          return res.status(400).json({
            error: 'Invalid signature',
            message:
              'Missing required webhook headers (webhook-signature, webhook-id, webhook-timestamp)',
          });
        }

        const isValid = polarAdapter.verifySignature(
          rawBody,
          webhookHeaders as any,
        );
        if (!isValid) {
          return res
            .status(400)
            .json({ error: 'Invalid signature', message: 'Invalid signature' });
        }

        const payload = req.body || {};
        const eventId =
          payload.event_id ||
          payload.id ||
          payload.event?.id ||
          webhookHeaders['webhook-id'] ||
          `event_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const eventType =
          payload.event_type ||
          payload.type ||
          payload.event?.type ||
          'unknown';

        let billingEvent;
        try {
          billingEvent = await prisma.billingEvent.create({
            data: {
              provider: 'polar',
              eventId,
              type: eventType,
              payload: payload as any,
              status: 'pending',
            },
          });
        } catch (error: any) {
          if (error.code === 'P2002') {
            billingEvent = await prisma.billingEvent.findUnique({
              where: {
                provider_eventId: {
                  provider: 'polar',
                  eventId,
                },
              },
            });
            if (!billingEvent) {
              return res.status(500).json({
                error: 'Internal server error',
                message:
                  'Event unique constraint violation but event not found in DB',
              });
            }
            if (billingEvent.status === 'processed') {
              return res.status(200).json({
                received: true,
                eventId,
                status: 'already_processed',
              });
            }
            if (billingEvent.status === 'failed') {
              return res.status(500).json({
                received: true,
                eventId,
                status: 'previously_failed',
              });
            }
          } else {
            return res.status(500).json({
              error: 'Internal server error',
              message: error?.message || 'Failed to persist event',
            });
          }
        }

        // Process asynchronously
        billingWebhookService
          .process(eventId)
          .catch((err: any) =>
            console.error(`Error processing event ${eventId}`, err),
          );

        return res.status(200).json({
          received: true,
          eventId,
          status: 'pending',
        });
      } catch (err: any) {
        console.error('Polar webhook handler error', err);
        return res.status(500).json({
          error: 'Internal server error',
          message: err?.message || 'Unexpected error',
        });
      }
    };

    instance.post('/billing/webhooks/polar', handlePolar);
    instance.post('/api/billing/webhooks/polar', handlePolar);
  }

  // Mount Better Auth handler directly on Express using toNodeHandler for proper adaptation
  try {
    const emailService = app.get(EmailService);
    const betterAuth = createAuthConfig(emailService);
    if (betterAuth && instance) {
      const ex = instance as any;
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.NEXT_PUBLIC_FRONTEND_URL,
        process.env.NEXT_PUBLIC_SITE_URL,
        'https://mandareen-frontend-git-improvements-matthews-projects-2968c0ec.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001',
      ].filter(Boolean) as string[];

      // Apply CORS for /auth routes
      ex.use(
        '/auth',
        cors({
          origin: allowedOrigins,
          credentials: true,
          maxAge: 86400, // cache preflight for 24h to reduce OPTIONS chatter
          allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization',
            'Cache-Control',
          ],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
          optionsSuccessStatus: 204,
        }),
      );

      // Use toNodeHandler to properly adapt Better Auth for Express/Node.js
      // Mount at /auth so Better Auth receives paths like /auth/sign-in/email
      const nodeHandler = toNodeHandler(betterAuth);
      ex.use('/auth', nodeHandler);
    }
  } catch (err) {
    console.error('Better Auth direct mount failed', err);
  }

  if (instance?.get) {
    instance.get('/auth/ping', (_req: unknown, res: any) =>
      res.status(200).json({ ok: true }),
    );

    if (betterAuthService) {
      instance.get('/auth/session', async (req: any, res: any) => {
        try {
          const data = await betterAuthService.api.getSession({
            headers: req.headers,
          });
          return res.status(200).json(data ?? null);
        } catch {
          return res.status(200).json(null);
        }
      });

      instance.get('/auth/get-session', async (req: any, res: any) => {
        try {
          const data = await betterAuthService.api.getSession({
            headers: req.headers,
          });
          return res.status(200).json(data ?? null);
        } catch {
          return res.status(200).json(null);
        }
      });
    }
  }

  // Enable CORS for frontend communication
  app.enableCors({
    origin: [
      'http://localhost:3001', // Frontend development
      'http://localhost:3000', // Alternative frontend port
      process.env.FRONTEND_URL || 'http://localhost:3001',
      'https://unartificial-marion-enrapturedly.ngrok-free.dev',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
    ],
    credentials: true, // Allow cookies and credentials
    maxAge: 86400, // cache preflight for 24h to cut repeated OPTIONS
  });

  // Add global prefix to all routes
  // app.setGlobalPrefix('api');

  // Serve static media (audio) from /media
  app.use(
    '/media',
    express.static(path.join(process.cwd(), 'uploads'), {
      fallthrough: true,
      redirect: false,
      setHeaders: (res) => {
        res.setHeader(
          'Access-Control-Allow-Origin',
          process.env.FRONTEND_URL || 'http://localhost:3001',
        );
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control',
        );
      },
    }),
  );

  // Note: Raw body preservation for webhook routes is handled via rawBody: true in NestFactory.create
  // The raw body will be available in controllers via @Req() req and accessing req.rawBody (Buffer)
  // Webhook controller will handle signature verification using the raw body

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      transform: true, // Transform payloads to DTO instances
      forbidNonWhitelisted: true, // Throw errors if non-whitelisted properties are present
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch(console.error);
