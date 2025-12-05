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
  senses?: Array<{ pinyin: string; definition: string }>; // All senses with distinct pinyin
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
  private readonly concurrentBatches =
    parseInt(process.env.SEGMENTATION_CONCURRENT_BATCHES || '10', 10) || 10;
  // Simple bounded LRU structures (only used in DB mode)
  private cacheCapacity = 10000;
  private cache = new Map<string, any>();
  private cacheOrder: string[] = [];
  private dictionary = new Map<string, DictEntry>();
  private maxTokenLength = 6;
  private firstCharSet = new Set<string>();

  // Track DB lookups for performance monitoring
  private dbLookupStats = {
    count: 0,
    totalTime: 0,
    reset: () => {
      this.dbLookupStats.count = 0;
      this.dbLookupStats.totalTime = 0;
    },
  };

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

  // Heuristics for common multi-pronunciation characters
  // Format: { hanzi: { pinyin: [context words that indicate this pinyin] } }
  private readonly pinyinHeuristics: Record<string, Record<string, string[]>> =
    {
      行: {
        háng: ['银', '银', '排', '列', '业', '银'], // 银行, 排行, 行列, 行业
        xíng: ['走', '为', '动', '人', '路', '程', '就', '可', '以', '不', '好', '还', '也', '都'], // 行走, 行为, 行动, 行人, 行路, 行程, 就行, 可以行, 不行, 好行, 还行, 也行, 都行
      },
      长: {
        zhǎng: ['成', '大', '首', '校', '辈', '老'], // 成长, 长大, 首长, 校长, 长辈, 长老
        cháng: ['短', '久', '远', '期', '时', '度'], // 长短, 长久, 长远, 长期, 长时, 长度
      },
      重: {
        zhòng: ['要', '大', '视', '量', '点', '心'], // 重要, 重大, 重视, 重量, 重点, 重心
        chóng: ['新', '复', '叠', '再', '次', '双'], // 重新, 重复, 重叠, 再重, 次重, 双重
      },
      着: {
        zhe: ['看', '听', '说', '想', '做', '用', '走', '来', '去', '在'], // Most common: 看着, 听着, 说着, 想着, 做着, 用着, 走着, 来着, 去着, 在着
        zháo: ['急', '火', '凉', '迷', '睡'], // 着急, 着火, 着凉, 着迷, 睡着
        zhuó: ['装', '手', '眼', '落', '陆'], // 着装, 着手, 着眼, 着落, 着陆
        zhāo: ['数', '法', '招'], // 着数, 着法, 着招
      },
      了: {
        le: ['来', '去', '好', '完', '到', '看', '说', '做', '吃', '走'], // Most common: 来了, 去了, 好了, 完了, 到了, 看了, 说了, 做了, 吃了, 走了
        liǎo: ['解', '得', '不', '知', '明'], // 了解, 了得, 不了, 知了, 明了
      },
      地: {
        de: ['慢', '快', '好', '坏', '高', '低', '大', '小'], // 慢慢地, 快快地, 好好地, 坏坏地
        dì: ['方', '球', '面', '点', '区', '图'], // 地方, 地球, 地面, 地点, 地区, 地图
      },
      得: {
        de: ['好', '快', '慢', '高', '低', '大', '小'], // 好得, 快得, 慢得
        dé: ['到', '到', '知', '分', '奖'], // 得到, 得知, 得分, 得奖
        děi: ['必', '需', '要', '应'], // 必须得, 需要得, 应该得
      },
      还: {
        hái: ['是', '有', '在', '要', '会', '能'], // 还是, 还有, 还在, 还要, 还会, 还能
        huán: ['给', '钱', '书', '债', '款'], // 还给, 还钱, 还书, 还债, 还款
      },
      都: {
        dōu: ['是', '有', '在', '要', '会', '能', '很', '很'], // 都是, 都有, 都在, 都要, 都会, 都能, 都很
        dū: ['市', '城', '会', '京'], // 都市, 都城, 都会, 首都
      },
    };

  /**
   * Normalizes pinyin for comparison (removes tone numbers and tone marks, converts to lowercase)
   */
  private normalizePinyinForComparison(pinyin: string): string {
    if (!pinyin) return '';
    // Convert to lowercase first
    let normalized = pinyin.toLowerCase();
    // Remove tone numbers (1-5)
    normalized = normalized.replace(/[1-5]/g, '');
    // Remove tone marks (ā, á, ǎ, à, etc.) - convert to base letter
    // Handle all tone mark variations for each vowel
    normalized = normalized
      .replace(/[āáǎà]/g, 'a')
      .replace(/[ēéěè]/g, 'e')
      .replace(/[īíǐì]/g, 'i')
      .replace(/[ōóǒò]/g, 'o')
      .replace(/[ūúǔù]/g, 'u')
      .replace(/[ǖǘǚǜ]/g, 'ü')
      .replace(/[ĀÁǍÀ]/g, 'a')
      .replace(/[ĒÉĚÈ]/g, 'e')
      .replace(/[ĪÍǏÌ]/g, 'i')
      .replace(/[ŌÓǑÒ]/g, 'o')
      .replace(/[ŪÚǓÙ]/g, 'u')
      .replace(/[ǕǗǙǛ]/g, 'ü');
    return normalized;
  }

  /**
   * Selects the best pinyin from multiple options based on context
   * Uses heuristics for common multi-pronunciation characters
   */
  private selectPinyinFromContext(
    hanzi: string,
    pinyinOptions: string[],
    contextWords: string[],
  ): string | null {
    if (pinyinOptions.length === 0) return null;
    if (pinyinOptions.length === 1) return pinyinOptions[0];

    // Check heuristics for this character
    const heuristics = this.pinyinHeuristics[hanzi];
    if (!heuristics) {
      // No heuristics, prefer the first option (or most common if we track frequency)
      return pinyinOptions[0];
    }

    // Score each pinyin option based on context
    const scores: Record<string, number> = {};
    for (const pinyin of pinyinOptions) {
      scores[pinyin] = 0;
      const normalizedPinyin = this.normalizePinyinForComparison(pinyin);

      // Check each heuristic pinyin option
      for (const [heuristicPinyin, contextWordsForPinyin] of Object.entries(
        heuristics,
      )) {
        const normalizedHeuristic =
          this.normalizePinyinForComparison(heuristicPinyin);
        if (normalizedPinyin === normalizedHeuristic) {
          // Check if any context word matches
          for (const contextWord of contextWords) {
            if (contextWordsForPinyin.includes(contextWord)) {
              scores[pinyin] += 1;
            }
          }
        }
      }
    }

    // Find the pinyin with highest score
    let bestPinyin = pinyinOptions[0];
    let bestScore = scores[bestPinyin] || 0;

    for (const pinyin of pinyinOptions) {
      const score = scores[pinyin] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestPinyin = pinyin;
      }
    }

    // If no context match found, use default preferences
    if (bestScore === 0) {
      // For 着, prefer zhe (most common) over zhao, zhuo, zhao
      if (hanzi === '着') {
        const zheIndex = pinyinOptions.findIndex((p) =>
          this.normalizePinyinForComparison(p).includes('zhe'),
        );
        if (zheIndex >= 0) {
          return pinyinOptions[zheIndex];
        }
      }
      // For 了, prefer le (most common) over liao
      if (hanzi === '了') {
        const leIndex = pinyinOptions.findIndex((p) =>
          this.normalizePinyinForComparison(p).includes('le'),
        );
        if (leIndex >= 0) {
          return pinyinOptions[leIndex];
        }
      }
      // For 行, prefer xíng (more common in single-character usage meaning "okay/fine") over háng
      if (hanzi === '行') {
        const xingIndex = pinyinOptions.findIndex((p) =>
          this.normalizePinyinForComparison(p).includes('xing'),
        );
        if (xingIndex >= 0) {
          return pinyinOptions[xingIndex];
        }
      }
      // For 地, prefer de (most common) over di
      if (hanzi === '地') {
        const deIndex = pinyinOptions.findIndex((p) =>
          this.normalizePinyinForComparison(p).includes('de'),
        );
        if (deIndex >= 0) {
          return pinyinOptions[deIndex];
        }
      }
      // For 得, prefer de (most common) over de, dei
      if (hanzi === '得') {
        const deIndex = pinyinOptions.findIndex(
          (p) =>
            this.normalizePinyinForComparison(p).includes('de') &&
            !this.normalizePinyinForComparison(p).includes('dei'),
        );
        if (deIndex >= 0) {
          return pinyinOptions[deIndex];
        }
      }
      // For 还, prefer hai (most common) over huan
      if (hanzi === '还') {
        const haiIndex = pinyinOptions.findIndex((p) =>
          this.normalizePinyinForComparison(p).includes('hai'),
        );
        if (haiIndex >= 0) {
          return pinyinOptions[haiIndex];
        }
      }
      // For 都, prefer dou (most common) over du
      if (hanzi === '都') {
        const douIndex = pinyinOptions.findIndex((p) =>
          this.normalizePinyinForComparison(p).includes('dou'),
        );
        if (douIndex >= 0) {
          return pinyinOptions[douIndex];
        }
      }
    }

    return bestPinyin;
  }

  /**
   * Extract all possible substrings from a Chinese run that might be needed for segmentation
   * Returns a Set of unique substrings (lengths 1 to maxLen)
   */
  private extractPotentialSubstrings(
    runText: string,
    maxLen: number,
  ): Set<string> {
    const substrings = new Set<string>();
    const runLength = runText.length;
    const actualMaxLen = Math.min(maxLen, runLength);

    for (let i = 0; i < runLength; i++) {
      const maxTokenLen = Math.min(actualMaxLen, runLength - i);
      for (let len = 1; len <= maxTokenLen; len++) {
        const substring = runText.substring(i, i + len);
        substrings.add(substring);
      }
    }

    return substrings;
  }

  /**
   * Batch load vocabulary items from DB and populate cache
   * This dramatically reduces DB queries by loading all potential words at once
   */
  private async batchLoadVocabularyItems(
    tokens: string[],
    localDict: Map<string, DictEntry>,
  ): Promise<void> {
    if (this.mode !== 'db' || tokens.length === 0) {
      return;
    }

    // Filter out tokens that are already in localDict or cache
    const tokensToLoad = tokens.filter((token) => {
      if (localDict.has(token)) return false;
      const cached = this.getFromCache(token);
      return cached === undefined; // Not cached (including negative cache)
    });

    if (tokensToLoad.length === 0) {
      return;
    }

    const batchStartTime = Date.now();

    // Batch query vocabulary items
    const foundItems = await this.prisma.vocabularyItem.findMany({
      where: { hanzi: { in: tokensToLoad } },
      select: {
        id: true,
        hanzi: true,
        hskLevel: true,
        pinyin: true,
        definition: true,
      },
    });

    // Create a map for quick lookup
    const itemMap = new Map(foundItems.map((item) => [item.hanzi, item]));

    // Batch query all senses for found items
    const itemIds = foundItems.map((item) => item.id).filter(Boolean);
    const sensesMap = new Map<
      number,
      Array<{ pinyin: string; definition: string }>
    >();

    if (itemIds.length > 0) {
      const senses = await (this.prisma as any).vocabularySense?.findMany({
        where: { vocabularyItemId: { in: itemIds } },
        select: {
          vocabularyItemId: true,
          definition: true,
          pinyin: true,
        },
      });

      if (Array.isArray(senses)) {
        for (const sense of senses) {
          const itemId = sense.vocabularyItemId;
          if (!itemId) continue;

          if (!sensesMap.has(itemId)) {
            sensesMap.set(itemId, []);
          }

          const senseDef = (sense?.definition || '').trim();
          const sensePinyin = (sense?.pinyin || '').trim().toLowerCase();

          if (senseDef.length > 0 || sensePinyin.length > 0) {
            sensesMap.get(itemId)!.push({
              pinyin: sensePinyin,
              definition: senseDef,
            });
          }
        }
      }
    }

    // Process each found item and populate cache
    for (const item of foundItems) {
      const senses = sensesMap.get(item.id!) || [];
      let basePinyin = item.pinyin || '';
      const definitionSet = new Set<string>();
      const sensesWithPinyin: Array<{ pinyin: string; definition: string }> =
        [];

      for (const sense of senses) {
        const senseDef = sense.definition.trim();
        if (senseDef.length > 0) {
          definitionSet.add(senseDef);
        }
        const sensePinyin = sense.pinyin.trim().toLowerCase();
        if (sensePinyin.length > 0) {
          sensesWithPinyin.push({
            pinyin: sensePinyin,
            definition: senseDef,
          });
          if (!basePinyin) {
            basePinyin = sensePinyin;
          }
        }
      }

      if (
        definitionSet.size === 0 &&
        (item.definition || '').trim().length > 0
      ) {
        definitionSet.add(item.definition!.trim());
      }
      const definitions = Array.from(definitionSet);

      // Collect all distinct pinyin options
      const allPinyinOptions = new Set<string>();
      if (basePinyin) {
        allPinyinOptions.add(basePinyin.toLowerCase());
      }
      for (const sense of sensesWithPinyin) {
        allPinyinOptions.add(sense.pinyin);
      }

      const entry: DictEntry = {
        hskLevel: item.hskLevel ?? undefined,
        pinyin: (basePinyin || '').toLowerCase() || undefined,
        definition:
          definitions.length > 0
            ? definitions.join('; ')
            : item.definition || undefined,
        definitions: definitions.length > 0 ? definitions : undefined,
        senses:
          sensesWithPinyin.length > 0
            ? sensesWithPinyin
            : allPinyinOptions.size > 1
              ? Array.from(allPinyinOptions).map((p) => ({
                  pinyin: p,
                  definition: definitions[0] || '',
                }))
              : undefined,
      };

      this.setInCache(item.hanzi, entry);
    }

    // Negative cache for tokens not found
    for (const token of tokensToLoad) {
      if (!itemMap.has(token)) {
        this.setInCache(token, null);
      }
    }

    const batchDuration = Date.now() - batchStartTime;
    this.dbLookupStats.count += tokensToLoad.length;
    this.dbLookupStats.totalTime += batchDuration;
  }

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

      const dbLookupStart = Date.now();
      const found = await this.prisma.vocabularyItem.findFirst({
        where: { hanzi: token },
        select: {
          id: true,
          hskLevel: true,
          pinyin: true,
          definition: true,
        },
      });
      const dbLookupDuration = Date.now() - dbLookupStart;
      this.dbLookupStats.count++;
      this.dbLookupStats.totalTime += dbLookupDuration;

      // Track slow DB lookups
      if (dbLookupDuration > 50) {
        this.logger.debug?.(
          `Slow DB lookup for "${token}": ${dbLookupDuration}ms`,
        );
      }

      if (found) {
        let basePinyin = found.pinyin || '';
        const definitionSet = new Set<string>();
        const sensesWithPinyin: Array<{ pinyin: string; definition: string }> =
          [];

        if (found.id) {
          const senses = await (this.prisma as any).vocabularySense?.findMany({
            where: { vocabularyItemId: found.id },
            select: { definition: true, pinyin: true },
          });
          if (Array.isArray(senses)) {
            const pinyinSet = new Set<string>();
            for (const sense of senses) {
              const senseDef = (sense?.definition || '').trim();
              if (senseDef.length > 0) {
                definitionSet.add(senseDef);
              }
              const sensePinyin = (sense?.pinyin || '').trim().toLowerCase();
              if (sensePinyin.length > 0) {
                pinyinSet.add(sensePinyin);
                sensesWithPinyin.push({
                  pinyin: sensePinyin,
                  definition: senseDef,
                });
              }
              if (!basePinyin) {
                basePinyin = sensePinyin;
              }
            }
          }
        }
        if (
          definitionSet.size === 0 &&
          (found.definition || '').trim().length > 0
        ) {
          definitionSet.add(found.definition!.trim());
        }
        const definitions = Array.from(definitionSet);

        // Collect all distinct pinyin options (base + senses)
        const allPinyinOptions = new Set<string>();
        if (basePinyin) {
          allPinyinOptions.add(basePinyin.toLowerCase());
        }
        for (const sense of sensesWithPinyin) {
          allPinyinOptions.add(sense.pinyin);
        }

        const entry: DictEntry = {
          hskLevel: found.hskLevel ?? undefined,
          pinyin: (basePinyin || '').toLowerCase() || undefined,
          definition:
            definitions.length > 0
              ? definitions.join('; ')
              : found.definition || undefined,
          definitions: definitions.length > 0 ? definitions : undefined,
          senses:
            sensesWithPinyin.length > 0
              ? sensesWithPinyin
              : allPinyinOptions.size > 1
                ? Array.from(allPinyinOptions).map((p) => ({
                    pinyin: p,
                    definition: definitions[0] || '',
                  }))
                : undefined,
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
    if (this.mode === 'db') {
      // In DB mode we rely on live lookups to avoid overriding real dictionary entries
      return;
    }
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
      // DB-backed mode: use a fixed upper bound
      this.maxTokenLength = 16;
      this.initialized = true;
      // this.logger.debug?.(
      //   `SegmentationService initialized (mode=db), maxTokenLength=${this.maxTokenLength} (fixed)`,
      // );
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
        definitions: undefined,
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
          definitions: undefined,
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
        // Group senses by vocabulary item
        const sensesByVocab = new Map<
          number,
          Array<{ pinyin: string; definition: string }>
        >();
        for (const s of senses) {
          if (!sensesByVocab.has(s.vocabularyItemId)) {
            sensesByVocab.set(s.vocabularyItemId, []);
          }
          const sensePinyin = (s.pinyin || '').trim().toLowerCase();
          const senseDef = (s.definition || '').trim();
          if (sensePinyin || senseDef) {
            sensesByVocab.get(s.vocabularyItemId)!.push({
              pinyin: sensePinyin,
              definition: senseDef,
            });
          }
        }

        // Update dictionary entries with senses
        for (const [vocabId, senseList] of sensesByVocab.entries()) {
          const hanzi = idToHanzi.get(vocabId);
          if (!hanzi) continue;
          const existing = this.dictionary.get(hanzi) || {};
          const existingDefs = Array.isArray((existing as any).definitions)
            ? ((existing as any).definitions as string[])
            : [];
          const defs = new Set<string>(existingDefs);
          const pinyinSet = new Set<string>();
          if ((existing as any).pinyin) {
            pinyinSet.add((existing as any).pinyin);
          }

          for (const sense of senseList) {
            if (sense.definition) defs.add(sense.definition);
            if (sense.pinyin) pinyinSet.add(sense.pinyin);
          }

          const combined = Array.from(defs);
          const allPinyinOptions = Array.from(pinyinSet);

          // Store senses with distinct pinyin (for context-aware selection)
          const sensesWithPinyin = senseList.filter((s) => s.pinyin);

          this.dictionary.set(hanzi, {
            hskLevel: (existing as any).hskLevel,
            pinyin:
              (existing as any).pinyin || allPinyinOptions[0] || undefined,
            definition:
              combined.length > 0
                ? combined.join('; ')
                : (existing as any).definition,
            definitions: combined.length > 0 ? combined : undefined,
            senses:
              sensesWithPinyin.length > 0
                ? sensesWithPinyin
                : allPinyinOptions.length > 1
                  ? allPinyinOptions.map((p) => ({
                      pinyin: p,
                      definition: combined[0] || '',
                    }))
                  : undefined,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Error loading vocabulary senses: ${error instanceof Error ? error.message : String(error)}`,
      );
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

    this.dbLookupStats.reset();

    // First pass: Collect all runs (both Chinese and non-Chinese) in order
    interface ChineseRun {
      startIndex: number;
      endIndex: number;
      text: string;
      maxLen: number;
      substrings: string[];
    }

    interface TextRun {
      type: 'chinese' | 'nonchinese';
      startIndex: number;
      endIndex: number;
      text: string;
      chineseRun?: ChineseRun; // Only for Chinese runs
    }

    const allRuns: TextRun[] = [];
    const chineseRuns: ChineseRun[] = [];
    let i = 0;
    while (i < textLength) {
      const char = text.charAt(i);

      // If not Chinese, group contiguous non-Chinese as a single non-word segment
      if (!this.isChinese(char)) {
        const start = i;
        while (i < textLength && !this.isChinese(text.charAt(i))) {
          i++;
        }
        const nonChineseText = text.slice(start, i);
        // Only add non-empty segments (skip empty strings)
        if (nonChineseText.length > 0) {
          allRuns.push({
            type: 'nonchinese',
            startIndex: start,
            endIndex: i,
            text: nonChineseText,
          });
        }
        continue;
      }

      // Find the end of the contiguous Chinese run
      let j = i;
      while (j < textLength && this.isChinese(text.charAt(j))) {
        j++;
      }

      const runText = text.substring(i, j);
      const maxRunLen = Math.min(this.maxTokenLength, runText.length);

      // Collect Chinese run info for batch loading
      const chineseRun: ChineseRun = {
        startIndex: i,
        endIndex: j,
        text: runText,
        maxLen: maxRunLen,
        substrings:
          this.mode === 'db'
            ? Array.from(this.extractPotentialSubstrings(runText, maxRunLen))
            : [],
      };

      chineseRuns.push(chineseRun);
      allRuns.push({
        type: 'chinese',
        startIndex: i,
        endIndex: j,
        text: runText,
        chineseRun: chineseRun,
      });

      i = j;
    }

    // In DB mode, batch load all substrings in parallel
    if (this.mode === 'db' && chineseRuns.length > 0) {
      for (
        let idx = 0;
        idx < chineseRuns.length;
        idx += this.concurrentBatches
      ) {
        const chunk = chineseRuns.slice(idx, idx + this.concurrentBatches);

        // Run all batches in this chunk in parallel
        const chunkPromises = chunk.map((run) =>
          this.batchLoadVocabularyItems(run.substrings, localDict),
        );

        await Promise.all(chunkPromises);
      }
    }

    // Second pass: Process all runs in original order
    for (const run of allRuns) {
      if (run.type === 'nonchinese') {
        // Non-Chinese runs are already complete, just add them
        segments.push({
          word: run.text,
          startIndex: run.startIndex,
          endIndex: run.endIndex,
          isWord: false,
        });
      } else {
        // Chinese runs need to be segmented
        const chineseRun = run.chineseRun!;

        let runSegments: SegmentResult[];
        if (this.bmmEnabled) {
          runSegments = await this.segmentChineseRunWithFmmBmm(
            chineseRun.text,
            chineseRun.startIndex,
            localDict,
            chineseRun.maxLen,
          );
        } else {
          // Fallback to old greedy approach
          runSegments = await this.segmentChineseRunGreedy(
            chineseRun.text,
            chineseRun.startIndex,
            localDict,
            chineseRun.maxLen,
          );
        }
        segments.push(...runSegments);
      }
    }

    // Filter out empty segments before applying pinyin disambiguation
    const filteredSegments = segments.filter(
      (seg) => seg.word && seg.word.trim().length > 0,
    );

    // Apply context-aware pinyin disambiguation
    const result = await this.applyContextAwarePinyin(
      filteredSegments,
      text,
      localDict,
    );

    return result;
  }

  /**
   * Post-processes segments to apply context-aware pinyin selection
   * for words with multiple pinyin options
   */
  private async applyContextAwarePinyin(
    segments: SegmentResult[],
    fullText: string,
    localDict: Map<string, DictEntry>,
  ): Promise<SegmentResult[]> {
    const results: SegmentResult[] = [];

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];

      // Only process words (not punctuation/spaces)
      if (!segment.isWord || !segment.word) {
        results.push(segment);
        continue;
      }

      // Get the entry from dictionary (preload) or lookup (DB mode)
      let entry: DictEntry | null = null;
      if (this.mode === 'preload') {
        entry = this.dictionary.get(segment.word) || null;
      } else {
        // DB mode: look up entry (will use cache if available)
        entry = await this.lookupEntry(segment.word, localDict);
      }

      if (!entry || !entry.senses || entry.senses.length <= 1) {
        // No multiple pinyin options, return as-is
        results.push(segment);
        continue;
      }

      // Collect all distinct pinyin options
      const pinyinOptions = new Set<string>();
      if (entry.pinyin) {
        pinyinOptions.add(entry.pinyin);
      }
      for (const sense of entry.senses) {
        if (sense.pinyin) {
          pinyinOptions.add(sense.pinyin);
        }
      }

      if (pinyinOptions.size <= 1) {
        results.push(segment);
        continue;
      }

      // Extract context: 2 words before and after, plus individual characters
      const contextWords: string[] = [];

      for (let i = Math.max(0, index - 2); i < index; i++) {
        if (segments[i]?.isWord && segments[i]?.word) {
          const word = segments[i].word;
          contextWords.push(word);
          // Also add individual characters for better matching
          if (word.length > 1) {
            for (const char of word) {
              if (this.isChinese(char)) {
                contextWords.push(char);
              }
            }
          }
        }
      }
      for (let i = index + 1; i < Math.min(segments.length, index + 3); i++) {
        if (segments[i]?.isWord && segments[i]?.word) {
          const word = segments[i].word;
          contextWords.push(word);
          // Also add individual characters for better matching
          if (word.length > 1) {
            for (const char of word) {
              if (this.isChinese(char)) {
                contextWords.push(char);
              }
            }
          }
        }
      }

      // Select best pinyin based on context
      const selectedPinyin = this.selectPinyinFromContext(
        segment.word,
        Array.from(pinyinOptions),
        contextWords,
      );

      if (selectedPinyin && selectedPinyin !== segment.pinyin) {
        results.push({
          ...segment,
          pinyin: selectedPinyin,
        });
      } else {
        results.push(segment);
      }
    }

    return results;
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
