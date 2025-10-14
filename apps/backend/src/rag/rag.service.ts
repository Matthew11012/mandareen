import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { GeminiEmbeddingService } from './gemini-embedding.service';

export interface RagSourceRef {
  key: string; // e.g., S1, S2
  sourceTitle?: string;
  sectionHeading?: string;
  chunkId?: number;
}

export interface RagContext {
  contextText: string; // human-readable, enumerated snippets for prompts
  sources: RagSourceRef[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private vectorReadyChecked = false;
  private vectorUsable = false;
  private originalEmbeddingDimension = 1536; // Track original embedding dimension

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
    private readonly geminiEmbedding: GeminiEmbeddingService,
  ) {}

  /**
   * Pad vector to target dimension by filling with zeros
   */
  private padVector(vector: number[], targetDim: number): number[] {
    if (vector.length >= targetDim) {
      return vector.slice(0, targetDim);
    }
    return [...vector, ...new Array(targetDim - vector.length).fill(0)];
  }

  /**
   * Generate embedding using Gemini model with semantic similarity
   * Falls back to OpenAI if Gemini is unavailable
   */
  private async generateEmbedding(texts: string[]): Promise<number[][]> {
    try {
      // Try Gemini first
      const geminiAvailable = await this.geminiEmbedding.isAvailable();
      if (geminiAvailable) {
        this.logger.log(`Using Gemini embeddings for ${texts.length} texts`);
        const embeddings = await this.geminiEmbedding.embedTexts(texts);

        // Log actual dimensions for debugging
        if (embeddings.length > 0) {
          const actualDim = embeddings[0].length;
          this.logger.log(`Gemini embeddings have ${actualDim} dimensions`);
        }

        // Store original dimension for database storage
        this.originalEmbeddingDimension =
          embeddings.length > 0 ? embeddings[0].length : 1536;

        // Return embeddings as-is (no padding needed for 1536 dimensions)
        return embeddings;
      }
    } catch (error) {
      this.logger.warn(
        'Gemini embedding failed, falling back to OpenAI:',
        error.message,
      );
    }

    // Fallback to OpenAI
    this.logger.log(
      `Using OpenAI embeddings for ${texts.length} texts (Gemini fallback)`,
    );
    const embeddings = await this.openai.embedTexts(
      texts,
      process.env.OPENAI_EMBED_MODEL,
    );

    // Store original dimension for database storage
    this.originalEmbeddingDimension =
      embeddings.length > 0 ? embeddings[0].length : 1536;

    // Return embeddings as-is (no padding needed for 1536 dimensions)
    return embeddings;
  }

  isEnabled(): boolean {
    const flag = (process.env.RAG_ENABLED || '').toLowerCase();
    return !['', '0', 'false', 'off', 'disabled'].includes(flag);
  }

  private async ensureVectorSchema(): Promise<boolean> {
    if (this.vectorReadyChecked) return this.vectorUsable;
    this.vectorReadyChecked = true;
    try {
      // Enable pgvector and ensure table exists. This is safe to run repeatedly.
      await (this.prisma as any).$executeRawUnsafe(
        'CREATE EXTENSION IF NOT EXISTS vector;',
      );

      // Check if table exists and has correct schema
      const tableExists = await (this.prisma as any).$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'RagEmbedding'
        );
      `);

      if (!tableExists[0].exists) {
        // Create table with 1536 dimensions for Gemini embeddings
        await (this.prisma as any).$executeRawUnsafe(`
          CREATE TABLE "RagEmbedding" (
            id SERIAL PRIMARY KEY,
            "chunkId" INTEGER NOT NULL REFERENCES "RagChunk"(id) ON DELETE CASCADE,
            kind TEXT NOT NULL, -- 'title' | 'zh' | 'en'
            dimension INTEGER NOT NULL, -- actual embedding dimension used
            vector vector(1536), -- Gemini embedding dimension
            UNIQUE ("chunkId", kind)
          );
        `);
      }

      // Create HNSW index if it doesn't exist
      const indexExists = await (this.prisma as any).$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM pg_indexes 
          WHERE tablename = 'RagEmbedding' 
          AND indexname = 'ragembedding_vector_hnsw'
        );
      `);

      if (!indexExists[0].exists) {
        await (this.prisma as any).$executeRawUnsafe(
          'CREATE INDEX ragembedding_vector_hnsw ON "RagEmbedding" USING hnsw (vector vector_cosine_ops);',
        );
      }
      this.vectorUsable = true;
    } catch (e) {
      this.logger.warn(
        'pgvector not available; falling back to LIKE search',
        e as any,
      );
      this.vectorUsable = false;
    }
    return this.vectorUsable;
  }

  async getUserProfile(userId: number): Promise<{
    level: number;
    strugglingWords: string[];
  }> {
    // Level from latest assessment; default 1
    const assess = await this.prisma.assessment.findFirst({
      where: { userId },
      orderBy: { takenAt: 'desc' },
      select: { levelPlaced: true },
    });
    const level = assess?.levelPlaced ?? 1;
    // Struggling words: lowest easiness flashcards, recent reviews with low quality
    const cards = await this.prisma.flashcard.findMany({
      where: { userId },
      orderBy: [{ easiness: 'asc' }, { nextReview: 'asc' }],
      take: 30,
      include: { vocab: { select: { hanzi: true } } },
    });
    const struggling = Array.from(
      new Set(cards.map((c) => c.vocab.hanzi).filter(Boolean)),
    ).slice(0, 20);
    return { level, strugglingWords: struggling };
  }

  private buildQueryVariants(
    query: string,
    user: { level: number; strugglingWords: string[] },
  ): string[] {
    const q = (query || '').slice(0, 400);
    const kws = Array.from(
      new Set(
        q
          .replace(/[\p{P}\p{S}]/gu, ' ')
          .split(/\s+/)
          .filter((s) => s.length > 1)
          .slice(0, 8),
      ),
    );
    const patterns = [
      '把',
      '被',
      '得',
      '了',
      '过',
      '在',
      '是…的',
      '把字句',
      '被动句',
      '结果补语',
      '趋向补语',
    ];
    const hits = patterns.filter((p) => q.includes(p));
    const struggling = user.strugglingWords.slice(0, 6);
    const base = [q];
    if (kws.length) base.push(kws.join(' '));
    if (hits.length) base.push(hits.join(' '));
    if (struggling.length) base.push(struggling.join(' '));
    // Uniq and trim
    return Array.from(new Set(base.map((s) => s.trim()).filter(Boolean)));
  }

  async retrieveForConversation(
    userId: number,
    assistantHanzi: string,
    userHanzi?: string,
  ): Promise<RagContext | null> {
    if (!this.isEnabled()) {
      this.logger.log('RAG is disabled, skipping retrieval');
      return null;
    }

    this.logger.log(
      `RAG retrieval for user ${userId}: "${assistantHanzi}" | "${userHanzi || ''}"`,
    );

    const user = await this.getUserProfile(userId);
    const queries = this.buildQueryVariants(
      `${assistantHanzi}\n${userHanzi || ''}`,
      user,
    );

    this.logger.log(
      `Generated ${queries.length} query variants: [${queries.join(', ')}]`,
    );

    const chunks = await this.searchChunks(queries, user.level, 3);

    this.logger.log(`Found ${chunks.length} relevant chunks for RAG context`);

    const context = this.composeContext(chunks);

    if (context) {
      this.logger.log(
        `RAG context composed: ${context.sources.length} sources, ${context.contextText.length} characters (limited to 3 sources for token efficiency)`,
      );
    } else {
      this.logger.log('No RAG context generated');
    }

    return context;
  }

  async retrieveForLesson(
    userId: number,
    opts: { topic?: string; level: number },
  ): Promise<RagContext | null> {
    if (!this.isEnabled()) return null;
    const user = await this.getUserProfile(userId);
    const queries = this.buildQueryVariants(
      opts.topic || `HSK-${opts.level}`,
      user,
    );
    const chunks = await this.searchChunks(queries, opts.level, 3);
    return this.composeContext(chunks);
  }

  private async searchChunks(
    queries: string[],
    level: number,
    take: number,
  ): Promise<
    Array<{
      id: number;
      sourceTitle?: string;
      sectionHeading?: string;
      hanzi?: string | null;
      english?: string | null;
    }>
  > {
    // Try vector search first
    try {
      if (await this.ensureVectorSchema()) {
        this.logger.log('Using vector search (ANN) for RAG retrieval');
        const ann = await this.searchChunksANN(queries, level, take);
        if (ann.length > 0) {
          this.logger.log(`Vector search returned ${ann.length} chunks`);
          return ann;
        }
      }
    } catch (err) {
      this.logger.warn('Error searching chunks ANN', err as any);
    }

    // Fallback: Simple LIKE-based retrieval
    this.logger.log('Falling back to LIKE-based search');
    const orClauses: any[] = [];
    for (const q of queries) {
      if (!q) continue;
      orClauses.push({ hanzi: { contains: q } });
      orClauses.push({ english: { contains: q, mode: 'insensitive' as any } });
    }
    const where = {
      AND: [
        orClauses.length ? { OR: orClauses } : {},
        {
          OR: [
            { hskMin: null, hskMax: null },
            { hskMin: { lte: level + 1 } },
            { hskMax: { gte: level - 1 } },
          ],
        },
      ],
    } as any;
    const rows = await (this.prisma as any).ragChunk.findMany({
      where,
      take,
      orderBy: { id: 'asc' },
      include: {
        source: { select: { title: true } },
        section: { select: { heading: true } },
      },
    } as any);

    this.logger.log(`LIKE-based search returned ${rows.length} chunks`);

    return rows.map((r: any) => ({
      id: r.id,
      sourceTitle: r.source?.title,
      sectionHeading: r.section?.heading,
      hanzi: r.hanzi,
      english: r.english,
    }));
  }

  private async searchChunksANN(
    queries: string[],
    level: number,
    take: number,
  ): Promise<
    Array<{
      id: number;
      sourceTitle?: string;
      sectionHeading?: string;
      hanzi?: string | null;
      english?: string | null;
    }>
  > {
    const qtexts = queries.filter(Boolean).slice(0, 3);
    if (qtexts.length === 0) return [];

    // Generate embeddings using Gemini model (1536 dimensions)
    const queryText = qtexts.join(' ');
    this.logger.log(`Generating embeddings for query: "${queryText}"`);

    const queryVecs = await this.generateEmbedding([queryText]);
    const titleVec = queryVecs;
    const enVec = queryVecs;
    const zhVec = queryVecs;

    this.logger.log(
      `Generated embeddings: title=${titleVec[0]?.length || 0}D, en=${enVec[0]?.length || 0}D, zh=${zhVec[0]?.length || 0}D`,
    );

    const titleLit =
      '[' + (titleVec[0] || []).map((x) => (x ?? 0).toFixed(6)).join(',') + ']';
    const enLit =
      '[' + (enVec[0] || []).map((x) => (x ?? 0).toFixed(6)).join(',') + ']';
    const zhLit =
      '[' + (zhVec[0] || []).map((x) => (x ?? 0).toFixed(6)).join(',') + ']';

    const k = Math.max(3, Math.min(take * 2, 15));

    // Raw SQL ANN with three-vector search and blended scoring
    const rows: any[] = await (this.prisma as any).$queryRawUnsafe(
      `
      WITH
      title AS (
        SELECT rc.id, rs.title AS sourceTitle, rsec.heading AS sectionHeading, rc.hanzi, rc.english,
               1 - (re.vector <#> CAST($1 AS vector)) AS score
        FROM "RagEmbedding" re
        JOIN "RagChunk" rc ON rc.id = re."chunkId"
        LEFT JOIN "RagSource" rs ON rs.id = rc."sourceId"
        LEFT JOIN "RagSection" rsec ON rsec.id = rc."sectionId"
        WHERE re.kind = 'title'
        ORDER BY re.vector <#> CAST($1 AS vector)
        LIMIT ${k}
      ),
      en AS (
        SELECT rc.id, rs.title AS sourceTitle, rsec.heading AS sectionHeading, rc.hanzi, rc.english,
               1 - (re.vector <#> CAST($2 AS vector)) AS score
        FROM "RagEmbedding" re
        JOIN "RagChunk" rc ON rc.id = re."chunkId"
        LEFT JOIN "RagSource" rs ON rs.id = rc."sourceId"
        LEFT JOIN "RagSection" rsec ON rsec.id = rc."sectionId"
        WHERE re.kind = 'en'
        ORDER BY re.vector <#> CAST($2 AS vector)
        LIMIT ${k}
      ),
      zh AS (
        SELECT rc.id, rs.title AS sourceTitle, rsec.heading AS sectionHeading, rc.hanzi, rc.english,
               1 - (re.vector <#> CAST($3 AS vector)) AS score
        FROM "RagEmbedding" re
        JOIN "RagChunk" rc ON rc.id = re."chunkId"
        LEFT JOIN "RagSource" rs ON rs.id = rc."sourceId"
        LEFT JOIN "RagSection" rsec ON rsec.id = rc."sectionId"
        WHERE re.kind = 'zh'
        ORDER BY re.vector <#> CAST($3 AS vector)
        LIMIT ${k}
      )
      SELECT * FROM (
        SELECT *, score * 0.4 AS weighted_score FROM title
        UNION ALL
        SELECT *, score * 0.3 AS weighted_score FROM en
        UNION ALL
        SELECT *, score * 0.3 AS weighted_score FROM zh
      ) u
      ORDER BY weighted_score DESC
      LIMIT ${take};
      `,
      titleLit,
      enLit,
      zhLit,
    );

    this.logger.log(`Vector search query returned ${rows.length} results`);

    return rows.map((r) => ({
      id: r.id,
      sourceTitle: r.sourcetitle,
      sectionHeading: r.sectionheading,
      hanzi: r.hanzi,
      english: r.english,
    }));
  }

  async upsertEmbeddingsForAllChunks(batchSize = 100): Promise<number> {
    if (!(await this.ensureVectorSchema())) return 0;
    let total = 0;
    while (true) {
      const chunks: any[] = await (this.prisma as any).$queryRawUnsafe(
        `
        SELECT rc.id, rc.hanzi, rc.english, rsec.heading
        FROM "RagChunk" rc
        LEFT JOIN "RagSection" rsec ON rsec.id = rc."sectionId"
        WHERE (
          -- Missing title embedding (always needed)
          NOT EXISTS (SELECT 1 FROM "RagEmbedding" re WHERE re."chunkId" = rc.id AND re.kind = 'title')
          -- Missing English embedding (only if English content exists)
          OR (TRIM(COALESCE(rc.english, '')) != '' AND NOT EXISTS (SELECT 1 FROM "RagEmbedding" re WHERE re."chunkId" = rc.id AND re.kind = 'en'))
          -- Missing Chinese embedding (only if Chinese content exists)
          OR (TRIM(COALESCE(rc.hanzi, '')) != '' AND NOT EXISTS (SELECT 1 FROM "RagEmbedding" re WHERE re."chunkId" = rc.id AND re.kind = 'zh'))
        )
        LIMIT ${batchSize};
        `,
      );
      if (!chunks || chunks.length === 0) break;

      // Prepare text arrays for three embedding types
      const titleTexts: string[] = [];
      const enTexts: string[] = [];
      const zhTexts: string[] = [];
      const ids: number[] = [];

      for (const c of chunks) {
        const en = (c.english || '').trim();
        const zh = (c.hanzi || '').trim();
        const title = (c.heading || '').trim();

        ids.push(c.id);
        titleTexts.push(title.length > 0 ? title : 'Untitled');
        enTexts.push(en.length > 0 ? en : zh);
        zhTexts.push(zh.length > 0 ? zh : en);
      }

      // Generate embeddings using Gemini model (1536 dimensions)
      const [titleVecs, enVecs, zhVecs] = await Promise.all([
        this.generateEmbedding(titleTexts),
        this.generateEmbedding(enTexts),
        this.generateEmbedding(zhTexts),
      ]);

      // Use original embedding dimension (before padding)
      const dim = this.originalEmbeddingDimension;
      this.logger.log(`Using embedding dimension: ${dim} for storage`);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const chunk = chunks[i];

        // Only insert embeddings for non-empty content
        const hasTitle = (chunk.heading || '').trim().length > 0;
        const hasEn = (chunk.english || '').trim().length > 0;
        const hasZh = (chunk.hanzi || '').trim().length > 0;

        // Insert title embedding (always present, fallback to 'Untitled')
        if (hasTitle || titleVecs[i]) {
          const titleLit =
            '[' +
            (titleVecs[i] || []).map((x) => (x ?? 0).toFixed(6)).join(',') +
            ']';
          await (this.prisma as any).$executeRawUnsafe(
            'INSERT INTO "RagEmbedding" ("chunkId", kind, dimension, vector) VALUES ($1, $2, $3, CAST($4 AS vector)) ON CONFLICT ("chunkId", kind) DO NOTHING;',
            id,
            'title',
            dim,
            titleLit,
          );
        }

        // Insert English embedding only if English content exists
        if (hasEn && enVecs[i]) {
          const enLit =
            '[' +
            (enVecs[i] || []).map((x) => (x ?? 0).toFixed(6)).join(',') +
            ']';
          await (this.prisma as any).$executeRawUnsafe(
            'INSERT INTO "RagEmbedding" ("chunkId", kind, dimension, vector) VALUES ($1, $2, $3, CAST($4 AS vector)) ON CONFLICT ("chunkId", kind) DO NOTHING;',
            id,
            'en',
            dim,
            enLit,
          );
        }

        // Insert Chinese embedding only if Chinese content exists
        if (hasZh && zhVecs[i]) {
          const zhLit =
            '[' +
            (zhVecs[i] || []).map((x) => (x ?? 0).toFixed(6)).join(',') +
            ']';
          await (this.prisma as any).$executeRawUnsafe(
            'INSERT INTO "RagEmbedding" ("chunkId", kind, dimension, vector) VALUES ($1, $2, $3, CAST($4 AS vector)) ON CONFLICT ("chunkId", kind) DO NOTHING;',
            id,
            'zh',
            dim,
            zhLit,
          );
        }
      }
      total += ids.length;
      if (ids.length < batchSize) break;
    }
    return total;
  }

  private composeContext(
    chunks: Array<{
      id: number;
      sourceTitle?: string;
      sectionHeading?: string;
      hanzi?: string | null;
      english?: string | null;
    }>,
  ): RagContext | null {
    if (!chunks || chunks.length === 0) return null;
    const lines: string[] = [];
    const sources: RagSourceRef[] = [];
    chunks.forEach((c, idx) => {
      const key = `S${idx + 1}`;
      const title = [c.sourceTitle, c.sectionHeading]
        .filter(Boolean)
        .join(' — ');
      const zh = (c.hanzi || '').trim();
      const en = (c.english || '').trim();
      lines.push(`[#${key}] ${title}\nZH: ${zh}\nEN: ${en}`.trim());
      sources.push({
        key,
        sourceTitle: c.sourceTitle,
        sectionHeading: c.sectionHeading,
        chunkId: c.id,
      });
    });
    return { contextText: lines.join('\n\n'), sources };
  }
}
