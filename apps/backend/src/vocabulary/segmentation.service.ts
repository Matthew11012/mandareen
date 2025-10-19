import { Injectable, Logger } from '@nestjs/common';
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

interface DictEntry {
  hskLevel?: number;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
}

@Injectable()
export class SegmentationService {
  constructor(private prisma: PrismaService) {
    this.prisma = prisma;
  }

  private initialized = false;
  private readonly logger = new Logger(SegmentationService.name);
  private mode: 'preload' | 'db' =
    (process.env.SEGMENTATION_MODE as any) === 'db' ? 'db' : 'preload';
  private bmmEnabled = process.env.SEGMENTATION_BMM_ENABLED !== 'false';
  // Simple bounded LRU structures (only used in DB mode)
  private cacheCapacity = 10000;
  private cache = new Map<string, any>();
  private cacheOrder: string[] = [];
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

  // Domain sets for heuristics
  private readonly conjunctionChars = new Set<string>([
    '和',
    '与',
    '跟',
    '及',
    '并',
    '且',
  ]);
  private readonly timeUnits = new Set<string>([
    '分钟',
    '分',
    '秒',
    '秒钟',
    '小时',
    '点',
    '点钟',
    '天',
    '日',
    '周',
    '星期',
    '月',
    '个月',
    '年',
  ]);
  private readonly chineseNumeralChars = new Set<string>([
    '零',
    '一',
    '二',
    '三',
    '四',
    '五',
    '六',
    '七',
    '八',
    '九',
    '十',
    '百',
    '千',
    '万',
    '亿',
    '两',
    '几',
    '半',
  ]);

  // Lookup wrapper that reuses preload map OR DB + LRU cache
  private async lookupEntry(
    token: string,
    localDict: Map<string, DictEntry>,
  ): Promise<DictEntry | null> {
    // Check localDict first (includes extraEntries)
    const localEntry = localDict.get(token);
    if (localEntry !== undefined) {
      return localEntry;
    }

    // If in DB mode, use cache and DB lookup
    if (this.mode === 'db') {
      const cached = this.getFromCache(token);
      if (cached !== undefined) {
        return cached || null;
      }

      const found = await this.prisma.vocabularyItem.findFirst({
        where: { hanzi: token },
        select: {
          hskLevel: true,
          pinyin: true,
          definition: true,
        },
      });

      if (found) {
        const entry: DictEntry = {
          hskLevel: found.hskLevel ?? undefined,
          pinyin: (found.pinyin || '').toLowerCase() || undefined,
          definition: found.definition || undefined,
        };
        this.setInCache(token, entry);
        return entry;
      } else {
        this.setInCache(token, null); // negative cache
        return null;
      }
    }

    return null;
  }

  // Forward Maximum Matching for a run (relative indices within run)
  private async fmmSegmentRun(
    runText: string,
    localDict: Map<string, DictEntry>,
    maxLen: number,
  ): Promise<
    Array<{ word: string; start: number; end: number; entry: DictEntry | null }>
  > {
    const tokens: Array<{
      word: string;
      start: number;
      end: number;
      entry: DictEntry | null;
    }> = [];
    const runLength = runText.length;
    let i = 0;

    while (i < runLength) {
      let matched = false;
      const maxTokenLen = Math.min(maxLen, runLength - i);

      for (let len = maxTokenLen; len >= 1; len--) {
        const substring = runText.substring(i, i + len);
        const entry = await this.lookupEntry(substring, localDict);

        if (entry) {
          tokens.push({
            word: substring,
            start: i,
            end: i + len,
            entry: entry,
          });
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Fallback: single character as unknown word
        tokens.push({
          word: runText.charAt(i),
          start: i,
          end: i + 1,
          entry: null,
        });
        i += 1;
      }
    }

    return tokens;
  }

  // Backward Maximum Matching for a run (relative indices within run)
  private async bmmSegmentRun(
    runText: string,
    localDict: Map<string, DictEntry>,
    maxLen: number,
  ): Promise<
    Array<{ word: string; start: number; end: number; entry: DictEntry | null }>
  > {
    const tokens: Array<{
      word: string;
      start: number;
      end: number;
      entry: DictEntry | null;
    }> = [];
    const runLength = runText.length;
    let i = runLength;

    while (i > 0) {
      let matched = false;
      const maxTokenLen = Math.min(maxLen, i);

      for (let len = maxTokenLen; len >= 1; len--) {
        const substring = runText.substring(i - len, i);
        const entry = await this.lookupEntry(substring, localDict);

        if (entry) {
          tokens.unshift({
            word: substring,
            start: i - len,
            end: i,
            entry: entry,
          });
          i -= len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Fallback: single character as unknown word
        tokens.unshift({
          word: runText.charAt(i - 1),
          start: i - 1,
          end: i,
          entry: null,
        });
        i -= 1;
      }
    }

    return tokens;
  }

  // Heuristic scoring for a segmentation
  private scoreSegmentation(
    seg: Array<{
      word: string;
      start: number;
      end: number;
      entry: DictEntry | null;
    }>,
    runText: string,
    localDict: Map<string, DictEntry>,
  ): number {
    let score = 0;

    for (let i = 0; i < seg.length; i++) {
      const token = seg[i];
      const word = token.word;

      // +2 for token length >= 2
      if (word.length >= 2) {
        score += 2;
      }

      // -1 for single-character tokens (but 0 if conjunction)
      if (word.length === 1) {
        if (!this.conjunctionChars.has(word)) {
          score -= 1;
        }
      }

      // +3 for time units
      if (this.timeUnits.has(word)) {
        score += 3;
      }

      // +2 if token enables a longer following token
      if (i < seg.length - 1) {
        const nextToken = seg[i + 1];
        if (nextToken.word.length > 1) {
          score += 2;
        }
      }

      // -2 penalty for conjunction chars that swallow next character
      if (word.length === 2 && this.conjunctionChars.has(word.charAt(0))) {
        const followingWord = runText.substring(token.end);
        // Check if there's a valid 2+ char word starting at the next character
        for (let len = 2; len <= Math.min(4, followingWord.length); len++) {
          const candidate = followingWord.substring(0, len);
          if (localDict.has(candidate)) {
            score -= 2;
            break;
          }
        }
      }
    }

    return score;
  }

  // Decide between two segmentations using simple, fast heuristics
  private chooseSegmentation(
    a: Array<{
      word: string;
      start: number;
      end: number;
      entry: DictEntry | null;
    }>,
    b: Array<{
      word: string;
      start: number;
      end: number;
      entry: DictEntry | null;
    }>,
    runText: string,
    localDict: Map<string, DictEntry>,
  ): 'a' | 'b' {
    // Primary: fewer tokens wins
    if (a.length !== b.length) {
      return a.length < b.length ? 'a' : 'b';
    }

    // Secondary: fewer single-character tokens wins
    const aSingleChars = a.filter((token) => token.word.length === 1).length;
    const bSingleChars = b.filter((token) => token.word.length === 1).length;
    if (aSingleChars !== bSingleChars) {
      return aSingleChars < bSingleChars ? 'a' : 'b';
    }

    // Tertiary: scoreSegmentation comparison
    const aScore = this.scoreSegmentation(a, runText, localDict);
    const bScore = this.scoreSegmentation(b, runText, localDict);
    if (aScore !== bScore) {
      return aScore > bScore ? 'a' : 'b';
    }

    // If still tied, prefer BMM (empirically helps with right-headed compounds)
    return 'b';
  }

  // Segment one contiguous Chinese run using FMM and BMM, then choose
  private async segmentChineseRunWithFmmBmm(
    runText: string,
    runOffset: number, // absolute index of run start in the original text
    localDict: Map<string, DictEntry>,
    maxLen: number,
  ): Promise<SegmentResult[]> {
    // Run both FMM and BMM
    const fmmTokens = await this.fmmSegmentRun(runText, localDict, maxLen);
    const bmmTokens = await this.bmmSegmentRun(runText, localDict, maxLen);

    // Choose the better segmentation
    const chosen = this.chooseSegmentation(
      fmmTokens,
      bmmTokens,
      runText,
      localDict,
    );
    const selectedTokens = chosen === 'a' ? fmmTokens : bmmTokens;

    // Debug logging
    // this.logger.debug?.(
    //   `FMM+BMM segmentation: chosen=${chosen}, fmmTokens=${fmmTokens.length}, bmmTokens=${bmmTokens.length}, ` +
    //     `fmmSingleChars=${fmmTokens.filter((t) => t.word.length === 1).length}, ` +
    //     `bmmSingleChars=${bmmTokens.filter((t) => t.word.length === 1).length}, ` +
    //     `fmmScore=${this.scoreSegmentation(fmmTokens, runText, localDict)}, ` +
    //     `bmmScore=${this.scoreSegmentation(bmmTokens, runText, localDict)}, ` +
    //     `mode=${this.mode}`,
    // );

    // Convert to SegmentResult with absolute indices
    return selectedTokens.map((token) => ({
      word: token.word,
      startIndex: runOffset + token.start,
      endIndex: runOffset + token.end,
      isWord: token.entry !== null,
      hskLevel: token.entry?.hskLevel,
      pinyin: token.entry?.pinyin,
      definition: token.entry?.definition,
      definitions: token.entry?.definitions,
    }));
  }

  // Optionally inject small time-unit lexemes into localDict if missing
  private augmentTimeUnits(localDict: Map<string, DictEntry>): void {
    for (const timeUnit of this.timeUnits) {
      if (!localDict.has(timeUnit)) {
        localDict.set(timeUnit, {
          hskLevel: undefined,
          pinyin: undefined,
          definition: undefined,
        });
      }
    }
  }

  private async initializeDictionary(): Promise<void> {
    if (this.initialized) {
      void this.prisma;
      return;
    }

    if (this.mode === 'db') {
      // DB-backed mode: compute max token length from DB (max hanzi char length)
      try {
        const rows: any[] = await (this.prisma as any)
          .$queryRaw`SELECT MAX(char_length("VocabularyItem"."hanzi"))::int AS max FROM "VocabularyItem";`;
        const val = Array.isArray(rows) ? rows[0]?.max : undefined;
        if (typeof val === 'number' && val > 0) {
          this.maxTokenLength = val;
        } else {
          // Fallback if table is empty or value is invalid
          this.maxTokenLength = 6;
        }
      } catch {
        // Fallback on error
        this.maxTokenLength = 6;
      }
      this.initialized = true;
      this.logger.debug?.(
        `SegmentationService initialized (mode=db), maxTokenLength=${this.maxTokenLength}`,
      );
      return;
    }

    // 1) Load vocabulary from DB (preload mode)
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

    // Finalize: use the computed maximum from loaded entries (no cap)

    this.initialized = true;
    this.logger.debug?.(
      `SegmentationService initialized (mode=preload), maxTokenLength=${this.maxTokenLength}, entries=${this.dictionary.size}`,
    );
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
    const localDict = new Map<string, DictEntry>();

    // Copy from main dictionary
    for (const [key, value] of this.dictionary) {
      localDict.set(key, value);
    }

    // Add extra entries
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

    // Augment with time units if missing
    this.augmentTimeUnits(localDict);

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

      // Find the end of the contiguous Chinese run
      let j = i;
      while (j < textLength && this.isChinese(text.charAt(j))) {
        j++;
      }

      // Segment the Chinese run using FMM+BMM or fallback to old greedy
      const runText = text.substring(i, j);
      const maxRunLen = Math.min(this.maxTokenLength, runText.length);

      if (this.bmmEnabled) {
        const runSegments = await this.segmentChineseRunWithFmmBmm(
          runText,
          i,
          localDict,
          maxRunLen,
        );
        segments.push(...runSegments);
      } else {
        // Fallback to old greedy approach
        const runSegments = await this.segmentChineseRunGreedy(
          runText,
          i,
          localDict,
          maxRunLen,
        );
        segments.push(...runSegments);
      }

      i = j;
    }

    return segments;
  }

  // Fallback greedy segmentation for Chinese runs (old logic)
  private async segmentChineseRunGreedy(
    runText: string,
    runOffset: number,
    localDict: Map<string, DictEntry>,
    maxLen: number,
  ): Promise<SegmentResult[]> {
    const segments: SegmentResult[] = [];
    const runLength = runText.length;
    let i = 0;

    while (i < runLength) {
      const char = runText.charAt(i);
      let matched = false;

      // Fast path (preload mode only): if first character cannot start any known word, emit single char
      if (this.mode === 'preload' && !this.firstCharSet.has(char)) {
        const chEntry = await this.lookupEntry(char, localDict);
        segments.push({
          word: char,
          startIndex: runOffset + i,
          endIndex: runOffset + i + 1,
          isWord: chEntry !== null,
          hskLevel: chEntry?.hskLevel,
          pinyin: chEntry?.pinyin,
          definition: chEntry?.definition,
          definitions: chEntry?.definitions,
        });
        i += 1;
        continue;
      }

      const maxTokenLen = Math.min(maxLen, runLength - i);
      for (let len = maxTokenLen; len >= 1; len--) {
        const substring = runText.substring(i, i + len);
        const entry = await this.lookupEntry(substring, localDict);

        if (entry) {
          segments.push({
            word: substring,
            startIndex: runOffset + i,
            endIndex: runOffset + i + len,
            isWord: true,
            hskLevel: entry.hskLevel,
            pinyin: entry.pinyin,
            definition: entry.definition,
            definitions: entry.definitions,
          });
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Fallback: single Chinese character as a word segment
        const chEntry = await this.lookupEntry(char, localDict);
        segments.push({
          word: char,
          startIndex: runOffset + i,
          endIndex: runOffset + i + 1,
          isWord: chEntry !== null,
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

  // LRU helpers (simple, bounded)
  private getFromCache(key: string): any | undefined {
    if (!this.cache.has(key)) return undefined;
    // move to MRU
    this.cacheOrder = this.cacheOrder.filter((k) => k !== key);
    this.cacheOrder.push(key);
    return this.cache.get(key);
  }

  private setInCache(key: string, value: any): void {
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.cacheOrder = this.cacheOrder.filter((k) => k !== key);
      this.cacheOrder.push(key);
      return;
    }
    if (this.cache.size >= this.cacheCapacity) {
      const lru = this.cacheOrder.shift();
      if (lru !== undefined) this.cache.delete(lru);
    }
    this.cache.set(key, value);
    this.cacheOrder.push(key);
  }
}
