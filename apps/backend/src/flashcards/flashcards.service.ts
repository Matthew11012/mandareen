import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentationService } from '../vocabulary/segmentation.service';

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

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private async computeSentencePinyinPerCharacter(
    text: string,
  ): Promise<string> {
    const segments = await this.segmentationService.segmentText(text);
    const totalChars = Array.from(text).length;
    const perChar: string[] = new Array(totalChars).fill('');
    let cursor = 0;
    for (const seg of segments) {
      const segLen = Array.from(seg.word).length;
      const tokens = (seg.pinyin || '').trim().split(/\s+/).filter(Boolean);
      if (seg.isWord && tokens.length > 0) {
        if (tokens.length === segLen) {
          for (let i = 0; i < segLen; i++) perChar[cursor + i] = tokens[i];
        } else {
          for (let i = 0; i < segLen; i++)
            perChar[cursor + i] = tokens[0] || '';
        }
      }
      cursor += segLen;
    }
    return perChar.join(' ');
  }

  async ensureVocabByHanzi(hanzi: string) {
    const existing = await this.prisma.vocabularyItem.findFirst({
      where: { hanzi },
    });
    if (existing) return existing;
    const created = await this.prisma.vocabularyItem.create({
      data: {
        hanzi,
        pinyin: '',
        definition: '',
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
        const prismaAny: any = this.prisma as any;
        const hasSentence = await prismaAny.flashcardSentence?.findFirst({
          where: { flashcardId: existing.id, hanzi: sentence.hanzi },
        });
        if (!hasSentence) {
          const pinyin =
            sentence.pinyin && sentence.pinyin.trim().length > 0
              ? sentence.pinyin
              : await this.computeSentencePinyinPerCharacter(sentence.hanzi);
          await prismaAny.flashcardSentence?.create({
            data: {
              flashcardId: existing.id,
              hanzi: sentence.hanzi,
              pinyin,
              translation: sentence.translation ?? null,
            },
          });
        } else if (
          sentence.translation &&
          hasSentence &&
          hasSentence.translation !== sentence.translation
        ) {
          const pinyin =
            sentence.pinyin && sentence.pinyin.trim().length > 0
              ? sentence.pinyin
              : await this.computeSentencePinyinPerCharacter(sentence.hanzi);
          await prismaAny.flashcardSentence?.create({
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
      const prismaAny: any = this.prisma as any;
      const pinyin =
        sentence.pinyin && sentence.pinyin.trim().length > 0
          ? sentence.pinyin
          : await this.computeSentencePinyinPerCharacter(sentence.hanzi);
      await prismaAny.flashcardSentence?.create({
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
      include: { vocab: true, sourceInstance: true },
      take: 100,
    });

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
      let pinyin = f.vocab?.pinyin || '';
      let definition = f.vocab?.definition || '';
      let hskLevel = f.vocab?.hskLevel ?? null;
      if (!pinyin || !definition || !hskLevel) {
        const wordHanzi = f.vocab?.hanzi || '';
        const segs = await this.segmentationService.segmentText(wordHanzi);
        const best = segs.find((s) => s.isWord && s.word === wordHanzi);
        if (best) {
          pinyin = pinyin || best.pinyin || '';
          if (!definition) {
            definition =
              (best.definitions && best.definitions.join('; ')) ||
              best.definition ||
              '';
          }
          if (!hskLevel) hskLevel = best.hskLevel ?? null;
        }
      }

      // Fetch sentences (best effort), compute pinyin if missing
      let sentences:
        | Array<{ hanzi: string; pinyin?: string; translation?: string }>
        | undefined;
      const prismaAny: any = this.prisma as any;
      const rows = await prismaAny.flashcardSentence?.findMany({
        where: { flashcardId: f.id },
        orderBy: { id: 'asc' },
      });
      if (Array.isArray(rows) && rows.length > 0) {
        sentences = [];
        for (const s of rows) {
          let sp: string | undefined = s.pinyin || undefined;
          if (!sp || sp.trim().length === 0) {
            sp = await this.computeSentencePinyinPerCharacter(s.hanzi);
          }
          sentences.push({
            hanzi: s.hanzi,
            pinyin: sp,
            translation: s.translation || undefined,
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
}
