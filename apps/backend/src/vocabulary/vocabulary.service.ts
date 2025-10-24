import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toToneMarks } from '../utils/pinyin';

@Injectable()
export class VocabularyService {
  private readonly logger = new Logger(VocabularyService.name);

  constructor(private prisma: PrismaService) {}

  async findVocabularyItem(hanzi: string): Promise<any> {
    const item = await this.prisma.vocabularyItem.findFirst({
      where: { hanzi },
      include: {
        senses: {
          select: { id: true, pinyin: true, definition: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!item) return null as any;
    const toneItem = {
      ...item,
      pinyin: toToneMarks(item.pinyin) ?? item.pinyin,
      senses: (item.senses || []).map((s: any) => ({
        ...s,
        pinyin: toToneMarks(s.pinyin) ?? s.pinyin,
      })),
    };
    return toneItem as any;
  }

  async createVocabularyItem(data: {
    hanzi: string;
    pinyin: string;
    definition: string;
    hskLevel?: number;
    isCustom?: boolean;
  }): Promise<any> {
    const created = await this.prisma.vocabularyItem.create({
      data: {
        ...data,
        isCustom: data.isCustom ?? false,
      },
    });
    // Populate pinyin_search via raw SQL to avoid Prisma type mismatch before client regenerate
    try {
      const norm = (data.pinyin || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[1-5]/g, '')
        .replace(/ü/g, 'v')
        .replace(/u:/g, 'v')
        .replace(/\s+/g, ' ')
        .trim();
      await this.prisma.$executeRawUnsafe(
        `UPDATE "VocabularyItem" SET "pinyin_search" = $1 WHERE id = $2`,
        norm || null,
        created.id,
      );
    } catch (err) {
      this.logger.debug(
        `Failed to set pinyin_search for ${created.id}: ${String(err)}`,
      );
    }
    return created as any;
  }

  async createWordInstance(data: {
    vocabId: number;
    startIndex: number;
    endIndex: number;
    context: string;
    sectionId?: number;
    messageId?: number;
  }): Promise<any> {
    // Filter out undefined values
    const cleanData: any = {
      vocabId: data.vocabId,
      startIndex: data.startIndex,
      endIndex: data.endIndex,
      context: data.context,
    };

    if (data.sectionId !== undefined) {
      cleanData.sectionId = data.sectionId;
    }

    if (data.messageId !== undefined) {
      cleanData.messageId = data.messageId;
    }

    return await Promise.resolve(
      this.prisma.wordInstance.create({
        data: cleanData,
        include: {
          vocab: true,
        },
      }),
    );
  }

  async searchVocabulary(
    query: string,
    limit: number = 20,
    cursor?: string,
    hskLevels?: number[],
    exact?: boolean,
  ): Promise<{ pinned?: any[]; items: any[]; nextCursor?: string }> {
    const q = (query || '').trim();
    if (!q) return { items: [], nextCursor: undefined };

    // Build patterns
    const lowerQ = q.toLowerCase();
    const normalizePinyin = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // strip diacritics
        .replace(/[1-5]/g, '') // remove tone digits
        .replace(/ü/g, 'v')
        .replace(/u:/g, 'v')
        .replace(/\s+/g, ' ')
        .trim();
    const pinyinQ = normalizePinyin(lowerQ);
    const likeContains = `%${lowerQ}%`;
    const likePrefix = `${lowerQ}%`;
    const likeContainsPinyin = `%${pinyinQ}%`;
    const likePrefixPinyin = `${pinyinQ}%`;

    // Very conservative regex word match for definitions (Phase 1)
    // Uses "(^|\\W)q(\\W|$)" — we escape regex metacharacters in q.
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = `(^|\\W)${escapeRegex(lowerQ)}(\\W|$)`;

    // Parse composite cursor: rank|hskSort|id
    let cursorRank: number | null = null;
    let cursorHsk: number | null = null;
    let cursorId: number | null = null;
    if (cursor && typeof cursor === 'string') {
      const parts = cursor.split('|');
      if (parts.length === 3) {
        const [r, h, i] = parts;
        const rr = parseInt(r, 10);
        const hh = parseInt(h, 10);
        const ii = parseInt(i, 10);
        if (!isNaN(rr) && !isNaN(hh) && !isNaN(ii)) {
          cursorRank = rr;
          cursorHsk = hh;
          cursorId = ii;
        }
      }
    }

    // Tiered ranking with FTS and pinyin_search
    const items: any[] = await this.prisma.$queryRawUnsafe(
      `
      WITH sense_defs AS (
        SELECT vs."vocabularyItemId" AS vocab_id,
               string_agg(vs.definition, ' \n ') AS sense_def
        FROM "VocabularySense" vs
        GROUP BY vs."vocabularyItemId"
      ),
      base AS (
        SELECT
          vi.id,
          vi.hanzi,
          vi.pinyin,
          vi.pinyin_search,
          vi.definition,
          vi."hskLevel",
          vi."isCustom",
          vi.traditional,
          vi.frequency,
          vi.source,
          vi."createdAt",
          sd.sense_def,
          CASE
            WHEN vi.hanzi = $1 OR (vi.pinyin_search IS NOT NULL AND vi.pinyin_search = $10) THEN 0
            WHEN LOWER(vi.definition) ~* $2 OR to_tsvector('simple', coalesce(vi.definition,'')) @@ plainto_tsquery('simple', $1)
              OR to_tsvector('simple', coalesce(sd.sense_def,'')) @@ plainto_tsquery('simple', $1) THEN 1
            WHEN LOWER(vi.hanzi) LIKE $3 OR (vi.pinyin_search IS NOT NULL AND vi.pinyin_search LIKE $11) THEN 2
            WHEN LOWER(vi.hanzi) LIKE $4 OR LOWER(vi.definition) LIKE $4 OR (vi.pinyin_search IS NOT NULL AND vi.pinyin_search LIKE $12) THEN 3
            ELSE 4
          END AS rank,
          COALESCE(vi."hskLevel", 999) AS hskSort
        FROM "VocabularyItem" vi
        LEFT JOIN sense_defs sd ON sd.vocab_id = vi.id
        WHERE (
          LOWER(vi.hanzi) LIKE $4 OR LOWER(vi.definition) LIKE $4 OR (vi.pinyin_search IS NOT NULL AND vi.pinyin_search LIKE $12)
          OR LOWER(vi.hanzi) LIKE $3 OR (vi.pinyin_search IS NOT NULL AND vi.pinyin_search LIKE $11)
          OR vi.hanzi = $1 OR (vi.pinyin_search IS NOT NULL AND vi.pinyin_search = $10)
          OR LOWER(vi.definition) ~* $2
          OR to_tsvector('simple', coalesce(vi.definition,'')) @@ plainto_tsquery('simple', $1)
          OR to_tsvector('simple', coalesce(sd.sense_def,'')) @@ plainto_tsquery('simple', $1)
        )
        AND ($5::int[] IS NULL OR vi."hskLevel" = ANY($5))
        AND ($13::boolean IS NULL OR $13 = false OR (
          -- exact mode narrows to exact or prefix style matches
          vi.hanzi = $1 OR (vi.pinyin_search IS NOT NULL AND (vi.pinyin_search = $10 OR vi.pinyin_search LIKE $11))
          OR LOWER(vi.definition) ~* $2
        ))
      )
      SELECT * FROM base
      WHERE rank < 4
      AND (
        $6::int IS NULL OR $7::int IS NULL OR $8::int IS NULL OR
        (rank > $6 OR (rank = $6 AND (hskSort > $7 OR (hskSort = $7 AND id > $8))))
      )
      ORDER BY rank ASC, hskSort ASC, id ASC
      LIMIT $9
      `,
      q,
      wordRegex,
      likePrefix,
      likeContains,
      hskLevels && hskLevels.length ? hskLevels : null,
      cursorRank,
      cursorHsk,
      cursorId,
      Math.min(Math.max(limit, 1), 100),
      pinyinQ,
      likePrefixPinyin,
      likeContainsPinyin,
      exact ?? null,
    );

    const nextCursor =
      items.length === Math.min(Math.max(limit, 1), 100)
        ? `${items[items.length - 1].rank}|${items[items.length - 1].hsksort ?? items[items.length - 1].hsksort}|${items[items.length - 1].id}`
        : undefined;

    const normalized = items.map((it) => ({
      ...it,
      hskLevel: it.hskLevel ?? it.hsklevel ?? null,
      pinyin: toToneMarks(it.pinyin) ?? it.pinyin,
    }));

    // Build pinned exact matches (exact hanzi or exact pinyin_search)
    let pinned: any[] = [];
    try {
      const exacts: any[] = await this.prisma.$queryRawUnsafe(
        `
        SELECT vi.id, vi.hanzi, vi.pinyin, vi.definition, vi."hskLevel"
        FROM "VocabularyItem" vi
        WHERE (
          vi.hanzi = $1 OR (vi.pinyin_search IS NOT NULL AND vi.pinyin_search = $2)
        ) AND ($3::int[] IS NULL OR vi."hskLevel" = ANY($3))
        ORDER BY COALESCE(vi."hskLevel", 999) ASC, vi.id ASC
        LIMIT 5
        `,
        q,
        pinyinQ,
        hskLevels && hskLevels.length ? hskLevels : null,
      );
      pinned = (exacts || []).map((it) => ({
        ...it,
        pinyin: toToneMarks(it.pinyin) ?? it.pinyin,
      }));
    } catch (err) {
      this.logger.debug(`Pinned exact match query failed: ${String(err)}`);
    }

    return { pinned, items: normalized, nextCursor };
  }
}
