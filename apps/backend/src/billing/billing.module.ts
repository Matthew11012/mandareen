import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingPlanService } from './billing-plan.service';
import { UsageService } from './usage.service';
import { RateLimitService } from './rate-limit.service';
import { ConcurrencyService } from './concurrency.service';
import { PolarAdapter } from './polar.adapter';
import { BillingService } from './billing.service';
import { BillingWebhookService } from './billing.webhook.service';
import { BillingWebhookController } from './billing.webhook.controller';
import { BillingController } from './billing.controller';
import { UsageController } from './usage.controller';
import { UsageRetentionService } from './usage-retention.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
    ScheduleModule,
  ],
  controllers: [BillingWebhookController, BillingController, UsageController],
  providers: [
    BillingPlanService,
    UsageService,
    RateLimitService,
    ConcurrencyService,
    PolarAdapter,
    BillingService,
    BillingWebhookService,
    UsageRetentionService,
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
