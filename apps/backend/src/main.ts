import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  // Enable body parsing - NestJS BetterAuthModule handles auth routes
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Get Express instance for direct route mounting
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance?.();

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_FRONTEND_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    'https://mandareen-frontend-git-improvements-matthews-projects-2968c0ec.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean) as string[];

  // Add extra CORS headers for /auth routes
  if (instance) {
    const ex = instance as any;
    ex.use('/auth', (req: any, res: any, next: any) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control',
      );
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      next();
    });
  }

  // Simple ping endpoint for health checks
  if (instance?.get) {
    instance.get('/auth/ping', (_req: unknown, res: any) =>
      res.status(200).json({ ok: true }),
    );
  }

  // Enable CORS for frontend communication
  app.enableCors({
    origin: [
      'http://localhost:3001', // Frontend development
      'http://localhost:3000', // Alternative frontend port
      process.env.FRONTEND_URL || 'http://localhost:3001',
      'https://unartificial-marion-enrapturedly.ngrok-free.dev',
      'https://mandareen-frontend-git-improvements-matthews-projects-2968c0ec.vercel.app',
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
