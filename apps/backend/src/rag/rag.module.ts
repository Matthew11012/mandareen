import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RagService } from './rag.service';
import { GeminiEmbeddingService } from './gemini-embedding.service';
import { MarkdownIngestionService } from './markdown-ingestion.service';
import { RagIngestCommand } from './rag-ingest.command';
import { OpenAIModule } from '../openai/openai.module';

@Module({
  imports: [PrismaModule, OpenAIModule],
  providers: [
    RagService,
    GeminiEmbeddingService,
    MarkdownIngestionService,
    RagIngestCommand,
  ],
  exports: [RagService, GeminiEmbeddingService, MarkdownIngestionService],
})
export class RagModule {}
