import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AssessmentModule } from './assessment/assessment.module';
import { OpenAIModule } from './openai/openai.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { LessonsModule } from './lessons/lessons.module';
import { FlashcardsModule } from './flashcards/flashcards.module';
import { ConversationsModule } from './conversations/conversations.module';
import { RagModule } from './rag/rag.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    PrismaModule,
    AssessmentModule,
    OpenAIModule,
    VocabularyModule,
    UsersModule,
    LessonsModule,
    FlashcardsModule,
    ConversationsModule,
    RagModule,
    CurriculumModule,
    NotificationsModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
