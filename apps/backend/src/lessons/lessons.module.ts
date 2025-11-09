import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsStreamController } from './lessons.stream.controller';
import { LessonsService } from './lessons.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenAIModule } from '../openai/openai.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { JwtModule } from '@nestjs/jwt';
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
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [LessonsController, LessonsStreamController],
  providers: [LessonsService],
})
export class LessonsModule {}
