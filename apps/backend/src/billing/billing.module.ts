import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingPlanService } from './billing-plan.service';
import { UsageService } from './usage.service';
import { RateLimitService } from './rate-limit.service';
import { ConcurrencyService } from './concurrency.service';
import { PolarAdapter } from './polar.adapter';
import { BillingService } from './billing.service';
import { BillingWebhookService } from './billing.webhook.service';
import { BillingWebhookController } from './billing.webhook.controller';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [BillingWebhookController],
  providers: [
    BillingPlanService,
    UsageService,
    RateLimitService,
    ConcurrencyService,
    PolarAdapter,
    BillingService,
    BillingWebhookService,
  ],
  exports: [
    BillingPlanService,
    UsageService,
    RateLimitService,
    ConcurrencyService,
    BillingService,
  ],
})
export class BillingModule {}
