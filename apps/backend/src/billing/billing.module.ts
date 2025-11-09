import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingPlanService } from './billing-plan.service';
import { UsageService } from './usage.service';
import { RateLimitService } from './rate-limit.service';
import { ConcurrencyService } from './concurrency.service';

@Module({
  imports: [PrismaModule],
  providers: [
    BillingPlanService,
    UsageService,
    RateLimitService,
    ConcurrencyService,
  ],
  exports: [
    BillingPlanService,
    UsageService,
    RateLimitService,
    ConcurrencyService,
  ],
})
export class BillingModule {}
