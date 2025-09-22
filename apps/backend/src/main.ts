import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend communication
  app.enableCors({
    origin: [
      'http://localhost:3001', // Frontend development
      'http://localhost:3000', // Alternative frontend port
      process.env.FRONTEND_URL || 'http://localhost:3001',
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
  app.setGlobalPrefix('api');

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
