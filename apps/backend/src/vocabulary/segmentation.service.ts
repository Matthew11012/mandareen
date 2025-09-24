import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';


export interface SegmentResult {
  word: string;
  startIndex: number;
  endIndex: number;
  isWord: boolean;
  hskLevel?: number;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
}

@Injectable()
export class SegmentationService {
  constructor(private prisma: PrismaService) {}

  private initialized = false;
  private dictionary = new Map<
    string,
    {
      hskLevel?: number;
      pinyin?: string;
      definition?: string;
      definitions?: string[];
    }
  >();
  private maxTokenLength = 6;
  private firstCharSet = new Set<string>();

  private async initializeDictionary(): Promise<void> {
    if (this.initialized) {
      void this.prisma;
      return;
    }

    console.log(
      '🔍 [SegmentationService] Initializing in-memory dictionary from DB...',
    );

    // 1) Load vocabulary from DB
    const vocabularyItems = await this.prisma.vocabularyItem.findMany({
      select: {
        id: true,
        hanzi: true,
        traditional: true,
        pinyin: true,
        definition: true,
        hskLevel: true,
      },
    });
    const idToHanzi = new Map<number, string>();
    for (const item of vocabularyItems) {
      if (!item.hanzi) continue;
      this.dictionary.set(item.hanzi, {
        hskLevel: item.hskLevel ?? undefined,
        pinyin: (item.pinyin || '').toLowerCase() || undefined,
        definition: item.definition || undefined,
        definitions: item.definition ? [item.definition] : undefined,
      });
      this.maxTokenLength = Math.max(this.maxTokenLength, item.hanzi.length);
      this.firstCharSet.add(item.hanzi.charAt(0));
      idToHanzi.set(item.id, item.hanzi);
      // Also index traditional if present
      if (item.traditional && !this.dictionary.has(item.traditional)) {
        this.dictionary.set(item.traditional, {
          hskLevel: item.hskLevel ?? undefined,
          pinyin: (item.pinyin || '').toLowerCase() || undefined,
          definition: item.definition || undefined,
          definitions: item.definition ? [item.definition] : undefined,
        });
        this.maxTokenLength = Math.max(
          this.maxTokenLength,
          item.traditional.length,
        );
        this.firstCharSet.add(item.traditional.charAt(0));
      }
    }

    // 2) Load senses and aggregate richer definitions/pinyin
    try {
      const senses = await (this.prisma as any).vocabularySense?.findMany({
        select: { vocabularyItemId: true, pinyin: true, definition: true },
      });
      if (Array.isArray(senses)) {
        for (const s of senses) {
          const hanzi = idToHanzi.get(s.vocabularyItemId);
          if (!hanzi) continue;
          const existing = this.dictionary.get(hanzi) || {};
          const defs = new Set<string>((existing as any).definitions || []);
          if (s.definition) defs.add(s.definition);
          const combined = Array.from(defs);
          this.dictionary.set(hanzi, {
            hskLevel: (existing as any).hskLevel,
            pinyin:
              (existing as any).pinyin ||
              (s.pinyin ? s.pinyin.toLowerCase() : undefined),
            definition:
              combined.length > 0
                ? combined.join('; ')
                : (existing as any).definition,
            definitions:
              combined.length > 0 ? combined : (existing as any).definitions,
          });
        }
      }
    } catch (error) {
      console.error('Error loading vocabulary senses:', error);
    }

    // Cap max token length and finalize (DB-only)
    this.maxTokenLength = Math.min(this.maxTokenLength, 16);

    // Quick debug sample
    const testWords = ['仿佛'];
    for (const word of testWords) {
      const entry = this.dictionary.get(word);
      if (entry) {
        console.log(
          `✓ Loaded "${word}": HSK ${entry.hskLevel || 'unknown'}, pinyin: ${entry.pinyin || 'none'}`,
        );
      }
    }

    this.initialized = true;
    return;

    
  }

  async segmentText(
    text: string,
    extraEntries?: Array<{
      text: string;
      hskLevel?: number;
      pinyin?: string;
      definition?: string;
    }>,
  ): Promise<SegmentResult[]> {
    await this.initializeDictionary();

    // Local dictionary for this text that prioritizes provided phrases/words
    const localDict = new Map(this.dictionary);
    if (extraEntries && extraEntries.length > 0) {
      for (const e of extraEntries) {
        if (!e?.text) continue;
        localDict.set(e.text, {
          hskLevel: e.hskLevel,
          pinyin: e.pinyin,
          definition: e.definition,
        });
        this.maxTokenLength = Math.max(this.maxTokenLength, e.text.length);
      }
    }

    const segments: SegmentResult[] = [];
    const textLength = text.length;

    let i = 0;
    while (i < textLength) {
      const char = text.charAt(i);

      // If not Chinese, group contiguous non-Chinese as a single non-word segment
      if (!this.isChinese(char)) {
        const start = i;
        while (i < textLength && !this.isChinese(text.charAt(i))) {
          i++;
        }
        segments.push({
          word: text.slice(start, i),
          startIndex: start,
          endIndex: i,
          isWord: false,
        });
        continue;
      }

      let matched = false;
      const maxLen = Math.min(this.maxTokenLength, textLength - i);

      // Fast path: if first character cannot start any known word, emit single char
      if (!this.firstCharSet.has(char)) {
        const chEntry = this.dictionary.get(char);
        segments.push({
          word: char,
          startIndex: i,
          endIndex: i + 1,
          isWord: true,
          hskLevel: chEntry?.hskLevel,
          pinyin: chEntry?.pinyin,
          definition: chEntry?.definition,
          definitions: chEntry?.definitions,
        });
        i += 1;
        continue;
      }

      // Debug logging for specific problematic words
      const remainingText = text.substring(i, i + 4); // Look ahead 4 characters
      const isDebugWord =
        remainingText.includes('仿佛') || remainingText.includes('你好');

      for (let len = maxLen; len >= 1; len--) {
        const substring = text.substring(i, i + len);
        const dictEntry = localDict.get(substring);

        if (isDebugWord && len >= 2) {
          console.log(
            `🔍 Checking "${substring}" (len=${len}): ${dictEntry ? '✓ FOUND' : '✗ not found'}`,
          );
        }

        if (dictEntry) {
          if (isDebugWord) {
            console.log(
              `✅ Matched "${substring}" with HSK ${dictEntry.hskLevel}`,
            );
          }
          segments.push({
            word: substring,
            startIndex: i,
            endIndex: i + len,
            isWord: true,
            hskLevel: dictEntry.hskLevel,
            pinyin: dictEntry.pinyin,
            definition: dictEntry.definition,
            definitions: dictEntry.definitions,
          });
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Fallback: single Chinese character as a word segment
        const chEntry = localDict.get(char);
        segments.push({
          word: char,
          startIndex: i,
          endIndex: i + 1,
          isWord: true,
          hskLevel: chEntry?.hskLevel,
          pinyin: chEntry?.pinyin,
          definition: chEntry?.definition,
          definitions: chEntry?.definitions,
        });
        i += 1;
      }
    }

    return segments;
  }

  private isChinese(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x20000 && code <= 0x2a6df)
    ); // CJK Extension B
  }
}
