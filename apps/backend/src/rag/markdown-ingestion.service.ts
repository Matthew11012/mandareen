import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiEmbeddingService } from './gemini-embedding.service';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface MarkdownChunk {
  title: string;
  zhText: string;
  enText: string;
  tokens: number;
  tags: string[];
  contentHash: string;
}

export interface IngestionResult {
  sourceId: number;
  sectionsCreated: number;
  chunksCreated: number;
  embeddingsGenerated: number;
}

@Injectable()
export class MarkdownIngestionService {
  private readonly logger = new Logger(MarkdownIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiEmbedding: GeminiEmbeddingService,
  ) {}

  /**
   * Ingest a Markdown file into the RAG system
   * @param filePath Path to the Markdown file
   * @param sourceTitle Title for the knowledge source
   * @param batchSize Batch size for processing
   * @returns Ingestion result
   */
  async ingestMarkdownFile(
    filePath: string,
    sourceTitle: string,
    batchSize: number = 50,
  ): Promise<IngestionResult> {
    this.logger.log(`Starting ingestion of ${filePath}`);

    // Read and parse the Markdown file
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = this.parseMarkdownToChunks(content);

    // Create or get the source
    const source = await this.upsertSource(sourceTitle, 'md', 'bilingual');

    // Process chunks in batches
    let sectionsCreated = 0;
    let chunksCreated = 0;
    let embeddingsGenerated = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const result = await this.processBatch(batch, source.id);

      sectionsCreated += result.sectionsCreated;
      chunksCreated += result.chunksCreated;
      embeddingsGenerated += result.embeddingsGenerated;

      this.logger.log(
        `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`,
      );
    }

    this.logger.log(
      `Ingestion complete: ${chunksCreated} chunks, ${embeddingsGenerated} embeddings`,
    );

    return {
      sourceId: source.id,
      sectionsCreated,
      chunksCreated,
      embeddingsGenerated,
    };
  }

  /**
   * Parse Markdown content into chunks based on "#" headings
   */
  private parseMarkdownToChunks(content: string): MarkdownChunk[] {
    const lines = content.split('\n');
    const chunks: MarkdownChunk[] = [];
    let currentTitle = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check if this is a heading
      if (trimmedLine.startsWith('#')) {
        // Save previous chunk if exists
        if (currentTitle && currentContent.length > 0) {
          const chunk = this.createChunkFromContent(
            currentTitle,
            currentContent,
          );
          if (chunk) chunks.push(chunk);
        }

        // Start new chunk
        currentTitle = trimmedLine.substring(2).trim();
        currentContent = [];
      } else if (trimmedLine) {
        // Add content to current chunk
        currentContent.push(line);
      }
    }

    // Save the last chunk
    if (currentTitle && currentContent.length > 0) {
      const chunk = this.createChunkFromContent(currentTitle, currentContent);
      if (chunk) chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create a chunk from title and content lines
   */
  private createChunkFromContent(
    title: string,
    contentLines: string[],
  ): MarkdownChunk | null {
    // Filter out empty lines before processing
    const nonEmptyLines = contentLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (nonEmptyLines.length === 0) {
      this.logger.debug(
        `Skipping chunk "${title}" - no content after filtering empty lines`,
      );
      return null;
    }

    const content = nonEmptyLines.join('\n');
    if (!content) return null;

    // Separate Chinese and English content
    const { zhText, enText } = this.separateChineseAndEnglish(content);

    // Skip chunks where both Chinese and English are empty
    if (!zhText.trim() && !enText.trim()) {
      this.logger.debug(
        `Skipping chunk "${title}" - no valid Chinese or English content`,
      );
      return null;
    }

    // Generate tags from title
    const tags = this.extractTagsFromTitle(title);

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const tokens = Math.ceil((zhText.length + enText.length) / 4);

    // Create content hash for idempotency
    const contentHash = crypto
      .createHash('md5')
      .update(`${title}|${zhText}|${enText}`)
      .digest('hex');

    return {
      title,
      zhText,
      enText,
      tokens,
      tags,
      contentHash,
    };
  }

  /**
   * Separate Chinese and English content from mixed text
   */
  private separateChineseAndEnglish(content: string): {
    zhText: string;
    enText: string;
  } {
    const lines = content.split('\n');
    const zhLines: string[] = [];
    const enLines: string[] = [];

    const hasChinese = (s: string): boolean => /[\u4e00-\u9fff]/.test(s);
    const hasLatin = (s: string): boolean => /[A-Za-z]/.test(s);
    const isTableRow = (s: string): boolean => s.includes('|');
    const isTableSep = (s: string): boolean =>
      /\|?\s*:?[-\s|:]+:?\s*\|?/.test(s) && !hasChinese(s) && !hasLatin(s);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Lightweight Markdown table handling
      if (isTableRow(line)) {
        // Skip pure separator rows like |---|---|
        if (isTableSep(line)) {
          continue;
        }

        // Split row into cells and route per cell
        const rawCells = line.split('|');
        const cells = rawCells.map((c) => c.trim()).filter((c) => c.length > 0);

        const zhCells: string[] = [];
        const enCells: string[] = [];

        for (const cell of cells) {
          const cellHasZh = hasChinese(cell);
          const cellHasEn = hasLatin(cell);

          if (cellHasZh && cellHasEn) {
            // Mixed cell: include in both to retain context
            zhCells.push(cell);
            enCells.push(cell);
          } else if (cellHasZh) {
            zhCells.push(cell);
          } else if (cellHasEn) {
            enCells.push(cell);
          } else {
            // Neither zh nor en (punctuation/numbers) -> include in both for alignment
            zhCells.push(cell);
            enCells.push(cell);
          }
        }

        if (zhCells.length > 0) {
          zhLines.push(zhCells.join(' | '));
        }
        if (enCells.length > 0) {
          enLines.push(enCells.join(' | '));
        }
        continue;
      }

      // Non-table line classification
      const lineHasZh = hasChinese(line);
      const lineHasEn = hasLatin(line);

      if (lineHasZh && lineHasEn) {
        // Mixed line: include in both
        zhLines.push(line);
        enLines.push(line);
      } else if (lineHasZh) {
        zhLines.push(line);
      } else if (lineHasEn) {
        enLines.push(line);
      } else {
        // Neither zh nor en: keep for both to preserve structure/context
        zhLines.push(line);
        enLines.push(line);
      }
    }

    return {
      zhText: zhLines.join('\n'),
      enText: enLines.join('\n'),
    };
  }

  /**
   * Extract tags from title for better retrieval
   */
  private extractTagsFromTitle(title: string): string[] {
    const tags: string[] = [];

    // Common grammar patterns
    const patterns = [
      'apologizing',
      'asking',
      'describing',
      'expressing',
      'indicating',
      'resultative',
      'complement',
      'verb',
      'adjective',
      'preposition',
      'weather',
      'illness',
      'temperature',
      'performance',
      'manner',
      'change-of-state',
      'stative',
      'duration',
      'action',
      'number',
      'negation',
      'negative',
      'interrogative',
      'question',
      'quantifier',
      'time',
      'space',
      'location',
      'direction',
      'possibility',
      'necessity',
      'causality',
      'concession',
      'conditional',
      'contrast',
      'agreement',
      'disagreement',
      'concurrence',
    ];

    const lowerTitle = title.toLowerCase();
    for (const pattern of patterns) {
      if (lowerTitle.includes(pattern)) {
        tags.push(pattern);
      }
    }

    // Add Chinese-specific tags
    if (/[\u4e00-\u9fff]/.test(title)) {
      tags.push('chinese');
    }

    return tags.length > 0 ? tags : ['grammar'];
  }

  /**
   * Process a batch of chunks
   */
  private async processBatch(
    chunks: MarkdownChunk[],
    sourceId: number,
  ): Promise<{
    sectionsCreated: number;
    chunksCreated: number;
    embeddingsGenerated: number;
  }> {
    const sectionsCreated = 0;
    let chunksCreated = 0;
    let embeddingsGenerated = 0;

    for (const chunk of chunks) {
      // Create or get section
      const section = await this.upsertSection(
        sourceId,
        chunk.title,
        chunk.tags,
      );
      if (!section) continue;

      // Create chunk
      const createdChunk = await this.upsertChunk(section.id, sourceId, chunk);
      if (!createdChunk) continue;

      chunksCreated++;

      // Skip embedding generation during ingestion - let rag.service.ts handle it
      // This ensures consistent 1536-dimension embeddings
    }

    return { sectionsCreated, chunksCreated, embeddingsGenerated };
  }

  /**
   * Create or get a knowledge source
   */
  private async upsertSource(
    title: string,
    sourceType: string,
    language: string,
  ): Promise<{ id: number }> {
    const existing = await this.prisma.ragSource.findFirst({
      where: { title },
    });

    if (existing) {
      return { id: existing.id };
    }

    const source = await this.prisma.ragSource.create({
      data: {
        title,
        sourceType,
        language,
        metadata: { ingestedAt: new Date().toISOString() },
      },
    });

    return { id: source.id };
  }

  /**
   * Create or get a section
   */
  private async upsertSection(
    sourceId: number,
    heading: string,
    tags: string[],
  ): Promise<{ id: number } | null> {
    const slug = this.createSlug(heading);

    const existing = await this.prisma.ragSection.findFirst({
      where: { sourceId, slug },
    });

    if (existing) {
      return { id: existing.id };
    }

    try {
      const section = await this.prisma.ragSection.create({
        data: {
          sourceId,
          heading,
          slug,
          tags,
          metadata: { createdAt: new Date().toISOString() },
        },
      });

      return { id: section.id };
    } catch (error) {
      this.logger.error(`Failed to create section for "${heading}":`, error);
      return null;
    }
  }

  /**
   * Create or get a chunk
   */
  private async upsertChunk(
    sectionId: number,
    sourceId: number,
    chunk: MarkdownChunk,
  ): Promise<{ id: number } | null> {
    const existing = await this.prisma.ragChunk.findFirst({
      where: { sectionId, hanzi: chunk.zhText },
    });

    if (existing) {
      return { id: existing.id };
    }

    try {
      const createdChunk = await this.prisma.ragChunk.create({
        data: {
          sourceId,
          sectionId,
          hanzi: chunk.zhText,
          english: chunk.enText,
          tokens: chunk.tokens,
          tags: chunk.tags,
        },
      });

      return { id: createdChunk.id };
    } catch (error) {
      this.logger.error(`Failed to create chunk for "${chunk.title}":`, error);
      return null;
    }
  }

  /**
   * Generate embeddings for a chunk
   */
  private async generateChunkEmbeddings(
    chunkId: number,
    chunk: MarkdownChunk,
  ): Promise<number> {
    // Filter out empty texts and track which ones are valid
    const texts = [chunk.title, chunk.enText, chunk.zhText];
    const kinds = ['title', 'en', 'zh'];

    const validTexts: string[] = [];
    const validKinds: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = (texts[i] || '').trim();
      if (text.length > 0) {
        validTexts.push(text);
        validKinds.push(kinds[i]);
      }
    }

    if (validTexts.length === 0) {
      this.logger.warn(`Skipping chunk ${chunkId} - all texts are empty`);
      return 0;
    }

    try {
      const embeddings = await this.geminiEmbedding.embedTexts(validTexts);

      for (let i = 0; i < embeddings.length; i++) {
        const embedding = embeddings[i];
        const kind = validKinds[i];

        const vectorLit =
          '[' + embedding.map((x) => (x ?? 0).toFixed(6)).join(',') + ']';

        // Use actual embedding dimension
        const actualDim = embedding.length;
        this.logger.log(
          `Storing ${kind} embedding with ${actualDim} dimensions`,
        );

        await (this.prisma as any).$executeRawUnsafe(
          'INSERT INTO "RagEmbedding" ("chunkId", kind, dimension, vector) VALUES ($1, $2, $3, CAST($4 AS vector)) ON CONFLICT ("chunkId", kind) DO NOTHING;',
          chunkId,
          kind,
          actualDim, // Use actual embedding dimension
          vectorLit,
        );
      }

      return embeddings.length;
    } catch (error) {
      this.logger.error(
        `Failed to generate embeddings for chunk ${chunkId}:`,
        error,
      );
      return 0;
    }
  }

  /**
   * Create a URL-friendly slug from title
   */
  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);
  }
}
