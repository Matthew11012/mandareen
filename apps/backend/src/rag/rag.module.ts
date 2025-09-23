import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RagService } from './rag.service';
import { OpenAIModule } from '../openai/openai.module';

@Module({
  imports: [PrismaModule, OpenAIModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}

