import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { OpenAIModule } from '../openai/openai.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { RagModule } from '../rag/rag.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
    OpenAIModule,
    VocabularyModule,
    RagModule,
    BillingModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
