import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { LessonsModule } from '../lessons/lessons.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CurriculumModule } from '../curriculum/curriculum.module';

@Module({
  imports: [LessonsModule, BillingModule, PrismaModule, CurriculumModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
