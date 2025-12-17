import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';
import { NestExpressApplication } from '@nestjs/platform-express';
import { EmailService } from './email/email.service';
import { createAuthConfig } from './auth/lib/auth';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  // Force Express adapter; Better Auth community integration relies on Express.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });

  // Early health check for /auth/ping to verify ingress reaches this service
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance?.();
  // Try to grab BetterAuthService to expose simple express-level fallbacks
  // (helps when framework-level mounting is flaky in certain deploys)
  const betterAuthService = app.get<BetterAuthService>(BetterAuthService, {
    strict: false,
  });

  // Mount Better Auth handler directly on Express to avoid community module mounting issues
  try {
    const emailService = app.get(EmailService);
    const betterAuth = createAuthConfig(emailService);
    if (instance?.use && betterAuth?.handler) {
      instance.use('/auth', betterAuth.handler);
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

      instance.post('/auth/sign-in/social', async (req: any, res: any) => {
        try {
          const data = await betterAuthService.api.signInSocial({
            headers: req.headers,
            body: req.body,
          });
          return res.status(200).json(data);
        } catch (e: any) {
          return res.status(400).json({
            message: e?.message || 'sign-in/social failed',
          });
        }
      });

      instance.post('/auth/sign-in/email', async (req: any, res: any) => {
        try {
          const data = await betterAuthService.api.signInEmail({
            headers: req.headers,
            body: req.body,
          });
          return res.status(200).json(data);
        } catch (e: any) {
          return res.status(400).json({
            message: e?.message || 'sign-in/email failed',
          });
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
