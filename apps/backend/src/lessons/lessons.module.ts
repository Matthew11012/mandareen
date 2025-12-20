import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsStreamController } from './lessons.stream.controller';
import { LessonsService } from './lessons.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenAIModule } from '../openai/openai.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { RagModule } from '../rag/rag.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    PrismaModule,
    OpenAIModule,
    VocabularyModule,
    RagModule,
    NotificationsModule,
    BillingModule,
  ],
  controllers: [LessonsController, LessonsStreamController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
