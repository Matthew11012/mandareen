import { Injectable, Logger } from '@nestjs/common';
import { MarkdownIngestionService } from '../rag/markdown-ingestion.service';
import { RagService } from '../rag/rag.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RagIngestCommand {
  private readonly logger = new Logger(RagIngestCommand.name);

  constructor(
    private readonly ingestionService: MarkdownIngestionService,
    private readonly ragService: RagService,
  ) {}

  async run(
    filePath: string,
    title?: string,
    batchSize: number = 50,
    generateEmbeddings: boolean = false,
  ): Promise<void> {
    const sourceTitle = title || this.generateTitleFromFile(filePath);

    this.logger.log(`Starting RAG ingestion:`);
    this.logger.log(`  File: ${filePath}`);
    this.logger.log(`  Title: ${sourceTitle}`);
    this.logger.log(`  Batch size: ${batchSize}`);
    this.logger.log(`  Generate embeddings: ${generateEmbeddings}`);

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      // Ingest the Markdown file
      const result = await this.ingestionService.ingestMarkdownFile(
        filePath,
        sourceTitle,
        batchSize,
      );

      this.logger.log(`Ingestion completed successfully:`);
      this.logger.log(`  Source ID: ${result.sourceId}`);
      this.logger.log(`  Sections created: ${result.sectionsCreated}`);
      this.logger.log(`  Chunks created: ${result.chunksCreated}`);
      this.logger.log(`  Embeddings generated: ${result.embeddingsGenerated}`);

      // Generate embeddings if requested
      if (generateEmbeddings) {
        this.logger.log('Generating embeddings for all chunks...');
        const embeddingsGenerated =
          await this.ragService.upsertEmbeddingsForAllChunks(batchSize);
        this.logger.log(`Generated ${embeddingsGenerated} embeddings`);
      }

      this.logger.log('RAG ingestion completed successfully!');
    } catch (error) {
      this.logger.error('RAG ingestion failed:', error);
      throw error;
    }
  }

  private generateTitleFromFile(filePath: string): string {
    const fileName = path.basename(filePath, path.extname(filePath));
    return fileName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }
}
