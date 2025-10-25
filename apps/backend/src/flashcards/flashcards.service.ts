import { Injectable } from '@nestjs/common';
import { toToneMarks } from '../utils/pinyin';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentationService } from '../vocabulary/segmentation.service';
import type { SegmentResult } from '../vocabulary/segmentation.service';

export interface CreateFlashcardInput {
  userId: number;
  vocabId: number;
  sourceInstanceId?: number;
}

export interface FlashcardSentenceInput {
  hanzi: string;
  pinyin?: string;
  translation?: string;
}

export interface ReviewResult {
  flashcardId: number;
  newNextReview: string;
  newIntervalDays: number;
  newEasiness: number;
}

export interface ListAllResult {
  items: Array<{
    id: number;
    vocabId: number;
    hanzi: string;
    pinyin: string;
    definition: string;
    hskLevel: number | null;
    nextReview: string;
    createdAt: string;
  }>;
  nextCursor?: { createdAt: string; id: number };
}

@Injectable()
export class FlashcardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segmentationService: SegmentationService,
  ) {
    void this.prisma;
    void this.segmentationService;
  }

  // Initial scheduling per SM-2
  private initialEasiness = 2.5;

  private isChineseChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    );
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private async computeSentencePinyinPerCharacter(
    text: string,
  ): Promise<string> {
    const segments = await this.segmentationService.segmentText(text);
    return this.computeSentencePinyinPerCharacterFromSegments(text, segments);
  }

  // Compute per-character pinyin using precomputed segments (avoids extra segmentation calls)
  private computeSentencePinyinPerCharacterFromSegments(
    text: string,
    segments: SegmentResult[],
  ): string {
    const chars = Array.from(text);
    const perChar: string[] = new Array(chars.length).fill('');
    // Pointer to next chinese char index in sentence
    let ci = 0;
    // Helper: advance ci to next Chinese
    const advanceToNextChinese = () => {
      while (ci < chars.length && !this.isChineseChar(chars[ci])) ci++;
    };
    advanceToNextChinese();
    for (const seg of segments) {
      if (!seg.isWord || !seg.pinyin) {
        // skip non-words; just advance ci by number of Chinese chars in seg
        const chineseLen = Array.from(seg.word).filter((c) =>
          this.isChineseChar(c),
        ).length;
        for (let k = 0; k < chineseLen; k++) {
          if (ci >= chars.length) break;
          advanceToNextChinese();
          ci++;
        }
        continue;
      }
      const tokenSyllables = seg.pinyin
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => toToneMarks(s) || '');
      const chineseLen = Array.from(seg.word).filter((c) =>
        this.isChineseChar(c),
      ).length;
      for (let k = 0; k < chineseLen; k++) {
        advanceToNextChinese();
        if (ci >= chars.length) break;
        perChar[ci] = tokenSyllables[k] || tokenSyllables[0] || '';
        ci++;
      }
    }
    // Fill any remaining pinyins as empty
    return perChar.join(' ');
  }

  async ensureVocabByHanzi(
    hanzi: string,
    opts?: { pinyin?: string; definition?: string; hskLevel?: number },
  ) {
    const existing = await this.prisma.vocabularyItem.findFirst({
      where: { hanzi },
    });
    if (existing) {
      const updates: any = {};
      if (
        (!existing.pinyin || existing.pinyin.trim().length === 0) &&
        opts?.pinyin
      ) {
        updates.pinyin = (opts.pinyin || '').toLowerCase();
      }
      if (
        (!existing.definition || existing.definition.trim().length === 0) &&
        opts?.definition
      ) {
        updates.definition = opts.definition;
      }
      if (existing.hskLevel == null && typeof opts?.hskLevel === 'number') {
        updates.hskLevel = opts.hskLevel;
      }
      if (Object.keys(updates).length > 0) {
        return this.prisma.vocabularyItem.update({
          where: { id: existing.id },
          data: updates,
        });
      }
      return existing;
    }
    const created = await this.prisma.vocabularyItem.create({
      data: {
        hanzi,
        pinyin: (opts?.pinyin || '').toLowerCase(),
        definition: opts?.definition || '',
        hskLevel:
          typeof opts?.hskLevel === 'number' ? opts!.hskLevel : undefined,
        isCustom: true,
      },
    });
    return created;
  }

  async addFlashcard(
    input: CreateFlashcardInput,
    sentence?: FlashcardSentenceInput,
  ) {
    const now = new Date();
    // New card: make due immediately (first review)
    const intervalDays = 1;
    const nextReview = now;

    const existing = await this.prisma.flashcard.findFirst({
      where: { userId: input.userId, vocabId: input.vocabId },
      include: { vocab: true },
    });
    if (existing) {
      // Append sentence if provided and not already present
      if (sentence?.hanzi) {
        // Insert a new sentence unless the exact same hanzi+translation row exists
        const exact = await this.prisma.flashcardSentence.findFirst({
          where: {
            flashcardId: existing.id,
            hanzi: sentence.hanzi,
            translation: sentence.translation ?? null,
          },
        });

        if (!exact) {
          const pinyin =
            sentence.pinyin && sentence.pinyin.trim().length > 0
              ? sentence.pinyin
              : await this.computeSentencePinyinPerCharacter(sentence.hanzi);
          await this.prisma.flashcardSentence.create({
            data: {
              flashcardId: existing.id,
              hanzi: sentence.hanzi,
              pinyin,
              translation: sentence.translation ?? null,
            },
          });
        }
      }
      return existing;
    }

    const flashcard = await this.prisma.flashcard.create({
      data: {
        userId: input.userId,
        vocabId: input.vocabId,
        sourceInstanceId: input.sourceInstanceId ?? null,
        nextReview,
        intervalDays,
        easiness: this.initialEasiness,
      },
      include: { vocab: true },
    });

    // Create initial sentence if provided
    if (sentence?.hanzi) {
      const pinyin =
        sentence.pinyin && sentence.pinyin.trim().length > 0
          ? sentence.pinyin
          : await this.computeSentencePinyinPerCharacter(sentence.hanzi);
      await this.prisma.flashcardSentence.create({
        data: {
          flashcardId: flashcard.id,
          hanzi: sentence.hanzi,
          pinyin,
          translation: sentence.translation ?? null,
        },
      });
    }

    return flashcard;
  }

  async listDue(userId: number) {
    const now = new Date();
    const due = await this.prisma.flashcard.findMany({
      where: { userId, nextReview: { lte: now } },
      orderBy: { nextReview: 'asc' },
      include: {
        vocab: true,
        sourceInstance: true,
        sentences: { orderBy: { id: 'asc' } },
      },
      take: 100,
    });

    // Collect unique texts for segmentation
    const vocabTextsNeedingFill = new Set<string>();
    const sentenceTexts: string[] = [];

    for (const f of due) {
      const hasPinyin = !!(f.vocab?.pinyin && f.vocab.pinyin.trim().length > 0);
      const hasDefinition = !!(
        f.vocab?.definition && f.vocab.definition.trim().length > 0
      );
      const hasHSK = f.vocab?.hskLevel != null;
      if (!(hasPinyin && hasDefinition && hasHSK)) {
        const wordHanzi = f.vocab?.hanzi || '';
        if (wordHanzi) vocabTextsNeedingFill.add(wordHanzi);
      }
      if (Array.isArray((f as any).sentences)) {
        for (const s of (f as any).sentences) {
          // We always need segments for client; pinyin only if missing
          if (typeof s?.hanzi === 'string' && s.hanzi.length > 0) {
            sentenceTexts.push(s.hanzi);
          }
        }
      }
    }

    // Deduplicate sentence texts
    const uniqueSentenceTexts = Array.from(new Set(sentenceTexts));

    // Run segmentation with small concurrency limit
    const segMap = new Map<string, SegmentResult[]>();
    const toProcess = [
      ...Array.from(vocabTextsNeedingFill),
      ...uniqueSentenceTexts,
    ];

    const concurrency = 6;
    let idx = 0;
    const workers: Promise<void>[] = [];
    const runWorker = async () => {
      while (idx < toProcess.length) {
        const current = toProcess[idx++];
        if (segMap.has(current)) continue;
        const segs = await this.segmentationService.segmentText(current);
        segMap.set(current, segs);
      }
    };
    for (let i = 0; i < Math.min(concurrency, toProcess.length); i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    const results = [] as Array<{
      id: number;
      vocabId: number;
      hanzi: string;
      pinyin: string;
      definition: string;
      hskLevel: number | null;
      nextReview: string;
      sentences?: Array<{
        hanzi: string;
        pinyin?: string;
        translation?: string;
      }>;
    }>;

    for (const f of due) {
      // Vocab fields, prefer stored
      let pinyin = toToneMarks(f.vocab?.pinyin || '') || '';
      let definition = f.vocab?.definition || '';
      let hskLevel = f.vocab?.hskLevel ?? null;
      if (!pinyin || !definition || !hskLevel) {
        const wordHanzi = f.vocab?.hanzi || '';
        const segs = wordHanzi ? segMap.get(wordHanzi) || [] : [];
        const best = segs.find((s) => s.isWord && s.word === wordHanzi);
        if (best) {
          pinyin = pinyin || toToneMarks(best.pinyin || '') || '';
          if (!definition) {
            definition =
              (best.definitions && best.definitions.join('; ')) ||
              best.definition ||
              '';
          }
          if (!hskLevel) hskLevel = best.hskLevel ?? null;
        }
      }

      // Sentences (already loaded); compute pinyin only when missing, reuse segments
      let sentences:
        | Array<{ hanzi: string; pinyin?: string; translation?: string }>
        | undefined;
      const rows = (f as any).sentences as
        | Array<{
            hanzi: string;
            pinyin?: string | null;
            translation?: string | null;
          }>
        | undefined;
      if (Array.isArray(rows) && rows.length > 0) {
        sentences = [];
        for (const s of rows) {
          const text = s.hanzi;
          const segs = segMap.get(text) || [];
          const sp: string | undefined =
            s.pinyin && s.pinyin.trim().length > 0
              ? s.pinyin
              : this.computeSentencePinyinPerCharacterFromSegments(text, segs);
          sentences.push({
            hanzi: text,
            pinyin: sp,
            translation: s.translation || undefined,
            // @ts-expect-error – enrich payload with segments for client rendering
            segments: segs.map((seg) => ({
              text: seg.word,
              isWord: seg.isWord,
              hskLevel: seg.hskLevel,
              pinyin: seg.pinyin ? toToneMarks(seg.pinyin) : undefined,
              definition: seg.definition,
              definitions: seg.definitions,
            })),
          });
        }
      }

      results.push({
        id: f.id,
        vocabId: f.vocabId,
        hanzi: f.vocab?.hanzi || '',
        pinyin,
        definition,
        hskLevel,
        nextReview: f.nextReview.toISOString(),
        sentences,
      });
    }

    return results;
  }

  // SM-2 review update
  async reviewFlashcard(
    flashcardId: number,
    quality: number,
  ): Promise<ReviewResult> {
    // Clamp quality 0-5
    const q = Math.max(0, Math.min(5, quality));

    const fc = await this.prisma.flashcard.findUnique({
      where: { id: flashcardId },
    });
    if (!fc) throw new Error('Flashcard not found');

    // E-Factor update (SM-2)
    let e = fc.easiness;
    e = e + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (e < 1.3) e = 1.3;

    let intervalDays = fc.intervalDays;
    if (q < 3) {
      // Fail: reset interval
      intervalDays = 1;
    } else {
      // Success: advance interval
      if (intervalDays === 1) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * e);
    }

    const nextReview = this.addDays(new Date(), intervalDays);

    const updated = await this.prisma.flashcard.update({
      where: { id: flashcardId },
      data: {
        easiness: e,
        intervalDays,
        nextReview,
        reviews: {
          create: {
            quality: q,
          },
        },
      },
    });

    return {
      flashcardId: updated.id,
      newEasiness: updated.easiness,
      newIntervalDays: updated.intervalDays,
      newNextReview: updated.nextReview.toISOString(),
    };
  }

  async listAll(
    userId: number,
    limit: number = 50,
    cursor?: { createdAt: Date; id: number },
  ): Promise<ListAllResult> {
    const whereClause: any = { userId };

    if (cursor) {
      whereClause.OR = [
        { createdAt: { lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          id: { lt: cursor.id },
        },
      ];
    }

    const flashcards = await this.prisma.flashcard.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1, // Take one extra to determine if there's a next page
      include: { vocab: true },
    });

    const hasNextPage = flashcards.length > limit;
    const items = hasNextPage ? flashcards.slice(0, limit) : flashcards;

    const result: ListAllResult = {
      items: items.map((f) => ({
        id: f.id,
        vocabId: f.vocabId,
        hanzi: f.vocab?.hanzi || '',
        pinyin: toToneMarks(f.vocab?.pinyin || '') || '',
        definition: f.vocab?.definition || '',
        hskLevel: f.vocab?.hskLevel ?? null,
        nextReview: f.nextReview.toISOString(),
        createdAt: f.createdAt.toISOString(),
      })),
    };

    if (hasNextPage && items.length > 0) {
      const lastItem = items[items.length - 1];
      result.nextCursor = {
        createdAt: lastItem.createdAt.toISOString(),
        id: lastItem.id,
      };
    }

    return result;
  }

  async deleteFlashcard(userId: number, cardId: number): Promise<number> {
    const result = await this.prisma.flashcard.deleteMany({
      where: { id: cardId, userId },
    });
    return result.count;
  }

  async deleteMany(userId: number, ids: number[]): Promise<number> {
    const result = await this.prisma.flashcard.deleteMany({
      where: { userId, id: { in: ids } },
    });
    return result.count;
  }
}
