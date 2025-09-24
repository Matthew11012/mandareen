import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
  ) {}

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
        'CREATE EXTENSION IF NOT EXISTS vector;'
      );
      await (this.prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "RagEmbedding" (
          id SERIAL PRIMARY KEY,
          "chunkId" INTEGER NOT NULL REFERENCES "RagChunk"(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, -- 'zh' | 'en'
          dimension INTEGER NOT NULL,
          vector vector, -- dimension validated at insert time
          UNIQUE ("chunkId", kind)
        );
      `);
      await (this.prisma as any).$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS ragembedding_vector_hnsw ON "RagEmbedding" USING hnsw (vector);'
      );
      this.vectorUsable = true;
    } catch (e) {
      this.logger.warn('pgvector not available; falling back to LIKE search', e as any);
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
      new Set(q
        .replace(/[\p{P}\p{S}]/gu, ' ')
        .split(/\s+/)
        .filter((s) => s.length > 1)
        .slice(0, 8)),
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
    if (!this.isEnabled()) return null;
    const user = await this.getUserProfile(userId);
    const queries = this.buildQueryVariants(
      `${assistantHanzi}\n${userHanzi || ''}`,
      user,
    );
    const chunks = await this.searchChunks(queries, user.level, 12);
    return this.composeContext(chunks);
  }

  async retrieveForLesson(
    userId: number,
    opts: { topic?: string; level: number },
  ): Promise<RagContext | null> {
    if (!this.isEnabled()) return null;
    const user = await this.getUserProfile(userId);
    const queries = this.buildQueryVariants(opts.topic || `HSK-${opts.level}`, user);
    const chunks = await this.searchChunks(queries, opts.level, 12);
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
        const ann = await this.searchChunksANN(queries, level, take);
        if (ann.length > 0) return ann;
      }
    } catch (err){
      this.logger.warn('Error searching chunks ANN', err as any);
    }
    // Fallback: Simple LIKE-based retrieval
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
    // Embed queries (both en + zh vectors)
    const [enVec] = await this.openai.embedTexts([qtexts.join(' ')], process.env.OPENAI_EMBED_MODEL);
    const [zhVec] = await this.openai.embedTexts([qtexts.join(' ')], process.env.OPENAI_EMBED_MODEL);
    const enLit = '[' + (enVec || []).map((x) => (x ?? 0).toFixed(6)).join(',') + ']';
    const zhLit = '[' + (zhVec || []).map((x) => (x ?? 0).toFixed(6)).join(',') + ']';
    const k = Math.max(4, Math.min(take * 2, 50));
    // Raw SQL ANN with simple union and score
    const rows: any[] = await (this.prisma as any).$queryRawUnsafe(
      `
      WITH
      en AS (
        SELECT rc.id, rs.title AS sourceTitle, rsec.heading AS sectionHeading, rc.hanzi, rc.english,
               1 - (re.vector <#> CAST($1 AS vector)) AS score
        FROM "RagEmbedding" re
        JOIN "RagChunk" rc ON rc.id = re."chunkId"
        LEFT JOIN "RagSource" rs ON rs.id = rc."sourceId"
        LEFT JOIN "RagSection" rsec ON rsec.id = rc."sectionId"
        WHERE re.kind = 'en'
        ORDER BY re.vector <#> CAST($1 AS vector)
        LIMIT ${k}
      ),
      zh AS (
        SELECT rc.id, rs.title AS sourceTitle, rsec.heading AS sectionHeading, rc.hanzi, rc.english,
               1 - (re.vector <#> CAST($2 AS vector)) AS score
        FROM "RagEmbedding" re
        JOIN "RagChunk" rc ON rc.id = re."chunkId"
        LEFT JOIN "RagSource" rs ON rs.id = rc."sourceId"
        LEFT JOIN "RagSection" rsec ON rsec.id = rc."sectionId"
        WHERE re.kind = 'zh'
        ORDER BY re.vector <#> CAST($2 AS vector)
        LIMIT ${k}
      )
      SELECT * FROM (
        SELECT * FROM en
        UNION ALL
        SELECT * FROM zh
      ) u
      GROUP BY id, sourceTitle, sectionHeading, hanzi, english, score
      ORDER BY score DESC
      LIMIT ${take};
      `,
      enLit,
      zhLit,
    );
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
        SELECT rc.id, rc.hanzi, rc.english
        FROM "RagChunk" rc
        WHERE NOT EXISTS (
          SELECT 1 FROM "RagEmbedding" re WHERE re."chunkId" = rc.id AND re.kind = 'en'
        ) OR NOT EXISTS (
          SELECT 1 FROM "RagEmbedding" re WHERE re."chunkId" = rc.id AND re.kind = 'zh'
        )
        LIMIT ${batchSize};
        `,
      );
      if (!chunks || chunks.length === 0) break;
      // Prepare text arrays
      const enTexts: string[] = [];
      const zhTexts: string[] = [];
      const ids: number[] = [];
      for (const c of chunks) {
        const en = (c.english || '').trim();
        const zh = (c.hanzi || '').trim();
        ids.push(c.id);
        enTexts.push(en.length > 0 ? en : zh);
        zhTexts.push(zh.length > 0 ? zh : en);
      }
      const enVecs = await this.openai.embedTexts(enTexts, process.env.OPENAI_EMBED_MODEL);
      const zhVecs = await this.openai.embedTexts(zhTexts, process.env.OPENAI_EMBED_MODEL);
      const dim = (enVecs?.[0]?.length || zhVecs?.[0]?.length) ?? 1536;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const enLit = '[' + (enVecs[i] || []).map((x) => (x ?? 0).toFixed(6)).join(',') + ']';
        const zhLit = '[' + (zhVecs[i] || []).map((x) => (x ?? 0).toFixed(6)).join(',') + ']';
        await (this.prisma as any).$executeRawUnsafe(
          'INSERT INTO "RagEmbedding" ("chunkId", kind, dimension, vector) VALUES ($1, $2, $3, CAST($4 AS vector)) ON CONFLICT ("chunkId", kind) DO NOTHING;',
          id,
          'en',
          dim,
          enLit,
        );
        await (this.prisma as any).$executeRawUnsafe(
          'INSERT INTO "RagEmbedding" ("chunkId", kind, dimension, vector) VALUES ($1, $2, $3, CAST($4 AS vector)) ON CONFLICT ("chunkId", kind) DO NOTHING;',
          id,
          'zh',
          dim,
          zhLit,
        );
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
      const title = [c.sourceTitle, c.sectionHeading].filter(Boolean).join(' — ');
      const zh = (c.hanzi || '').trim();
      const en = (c.english || '').trim();
      lines.push(
        `[#${key}] ${title}\nZH: ${zh}\nEN: ${en}`.trim(),
      );
      sources.push({ key, sourceTitle: c.sourceTitle, sectionHeading: c.sectionHeading, chunkId: c.id });
    });
    return { contextText: lines.join('\n\n'), sources };
  }
}
