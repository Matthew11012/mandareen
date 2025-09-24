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

  private isChineseChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    );
  }

  private toToneMarkSyllable(syl: string): string {
    // Normalize alternate representations of ü before parsing tones
    const normalized = (syl || '').replace(/u:/gi, 'ü').replace(/v/gi, 'ü');
    const m = normalized.match(
      /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]?)([aeiouüv]+[a-z]*)([1-5])?$/i,
    );
    if (!m) return normalized.toLowerCase();
    const head = (m[1] || '').toLowerCase();
    let body = (m[2] || '').toLowerCase();
    const tone = parseInt(m[3] || '0', 10);
    body = body.replace('v', 'ü').replace('u:', 'ü');
    if (!tone || tone === 5) return head + body;
    const toneMap: Record<string, string[]> = {
      a: ['ā', 'á', 'ǎ', 'à'],
      e: ['ē', 'é', 'ě', 'è'],
      i: ['ī', 'í', 'ǐ', 'ì'],
      o: ['ō', 'ó', 'ǒ', 'ò'],
      u: ['ū', 'ú', 'ǔ', 'ù'],
      ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
    };
    let idx = -1;
    if (body.includes('a')) idx = body.indexOf('a');
    else if (body.includes('e')) idx = body.indexOf('e');
    else if (body.includes('ou')) idx = body.indexOf('o');
    else {
      for (const v of ['i', 'o', 'u', 'ü']) {
        const pos = body.indexOf(v);
        if (pos >= 0) {
          idx = pos;
          break;
        }
      }
    }
    if (idx >= 0) {
      const v = body[idx];
      const marked = (toneMap as any)[v]?.[tone - 1];
      if (marked) body = body.slice(0, idx) + marked + body.slice(idx + 1);
    }
    return head + body;
  }

  private toToneMarks(line?: string): string | undefined {
    if (!line) return undefined;
    return line
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => this.toToneMarkSyllable(s))
      .join(' ');
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
        .map((s) => this.toToneMarkSyllable(s));
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
      let pinyin = this.toToneMarks(f.vocab?.pinyin || '') || '';
      let definition = f.vocab?.definition || '';
      let hskLevel = f.vocab?.hskLevel ?? null;
      if (!pinyin || !definition || !hskLevel) {
        const wordHanzi = f.vocab?.hanzi || '';
        const segs = await this.segmentationService.segmentText(wordHanzi);
        const best = segs.find((s) => s.isWord && s.word === wordHanzi);
        if (best) {
          pinyin = pinyin || this.toToneMarks(best.pinyin || '') || '';
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
      const rows = await this.prisma.flashcardSentence.findMany({
        where: { flashcardId: f.id },
        orderBy: { id: 'asc' },
      });
      if (Array.isArray(rows) && rows.length > 0) {
        sentences = [];
        for (const s of rows) {
          // Always recompute to ensure alignment correctness and tone marks
          const sp: string | undefined =
            await this.computeSentencePinyinPerCharacter(s.hanzi);
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
