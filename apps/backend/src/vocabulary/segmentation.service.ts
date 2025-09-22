import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// import * as fs from 'fs';
// import * as path from 'path';

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
    } catch {
      // vocabularySense may not exist yet; ignore
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

    /*
    // 2) Load HSK JSON dictionaries (disabled; DB-only path)
    const candidatePaths = [
      // Monorepo root
      path.resolve(process.cwd(), 'apps/backend/data/hsk/complete-hsk.json'),
      // Compiled dist-relative
      path.resolve(__dirname, '../../data/hsk/complete-hsk.json'),
    ];

    for (const filePath of candidatePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);

          // Try shape: { hsk1: [...], hsk2: [...], ... }
          const levelKeys = Object.keys(data).filter((k) => /hsk\d+/i.test(k));
          if (levelKeys.length > 0) {
            for (const key of levelKeys) {
              const match = key.match(/hsk(\d+)/i);
              const level = match ? parseInt(match[1], 10) : undefined;
              const entries: string[] = Array.isArray(data[key])
                ? data[key]
                : [];
              for (const hanzi of entries) {
                if (!this.dictionary.has(hanzi)) {
                  this.dictionary.set(hanzi, { hskLevel: level });
                } else {
                  const existing = this.dictionary.get(hanzi)!;
                  if (!existing.hskLevel && level) existing.hskLevel = level;
                }
                this.maxTokenLength = Math.max(
                  this.maxTokenLength,
                  hanzi.length,
                );
              }
            }
          } else if (Array.isArray(data)) {
            // Try shape: array of objects with various fields
            const pickString = (
              obj: any,
              keys: string[],
            ): string | undefined => {
              for (const k of keys) {
                const val = obj?.[k];
                if (typeof val === 'string' && val.trim().length > 0)
                  return val.trim().toLowerCase();
              }
              return undefined;
            };
            const pickLevel = (
              obj: any,
              keys: string[],
            ): number | undefined => {
              for (const k of keys) {
                const val = obj?.[k];
                if (typeof val === 'number') return val;
                if (typeof val === 'string') {
                  const m = val.match(/\d+/);
                  if (m) return parseInt(m[0], 10);
                }
                // Handle arrays like ["new-6", "old-5"]
                if (Array.isArray(val) && val.length > 0) {
                  // Prefer the entry starting with "new-"
                  const newEntry = val.find(
                    (x: any) =>
                      typeof x === 'string' &&
                      x.toLowerCase().startsWith('new-'),
                  );
                  if (typeof newEntry === 'string') {
                    const m = newEntry.match(/\d+/);
                    if (m) return parseInt(m[0], 10);
                  }
                  // Fallback: first numeric value
                  for (const item of val) {
                    if (typeof item === 'number') return item;
                    if (typeof item === 'string') {
                      const m = item.match(/\d+/);
                      if (m) return parseInt(m[0], 10);
                    }
                  }
                }
              }
              return undefined;
            };

            for (const entry of data) {
              // Extract primary hanzi from root level
              const hanziPrimary: string | undefined = pickString(entry, [
                'simplified',
                's', // shortened key
              ]);

              // Extract level from root level (handles arrays like ["new-6", "old-5"])
              const hskLevel: number | undefined = pickLevel(entry, [
                'level',
                'l', // shortened key
                'hskLevel',
                'hsk_level',
                'hsk',
              ]);

              // Extract pinyin and meanings from forms array (nested structure)
              let pinyin: string | undefined;
              let definition: string | undefined;
              let definitionsArr: string[] | undefined;
              let hanziTraditional: string | undefined;
              // Aggregate meanings across forms (ensure defined for all branches)
              const aggregateMeanings: string[] = [];

              const forms = entry?.forms || [];
              if (Array.isArray(forms) && forms.length > 0) {
                // Aggregate across ALL forms to collect all meanings
                const firstForm = forms[0];

                // Extract traditional from first form
                hanziTraditional = pickString(firstForm, [
                  'traditional',
                  't', // shortened key
                ]);

                // Extract pinyin from transcriptions
                const transcriptions =
                  firstForm?.transcriptions || firstForm?.i; // 'i' is shortened key
                if (transcriptions) {
                  // Prefer standard pinyin over numeric
                  const std = pickString(transcriptions, ['pinyin', 'y']);
                  const numeric = pickString(transcriptions, ['numeric', 'n']);
                  pinyin = (std || numeric)?.toLowerCase();
                }

                // Extract meanings
                const meanings = firstForm?.meanings || firstForm?.m; // 'm' is shortened key
                if (Array.isArray(meanings) && meanings.length > 0) {
                  aggregateMeanings.push(
                    ...meanings.map((m: string) => m.trim()).filter(Boolean),
                  );
                }
              }

              const addForm = (hanziForm?: string) => {
                if (!hanziForm) return;
                if (!this.dictionary.has(hanziForm)) {
                  this.dictionary.set(hanziForm, {
                    hskLevel,
                    pinyin,
                    definition:
                      aggregateMeanings.length > 0
                        ? aggregateMeanings.join('; ')
                        : definition,
                    definitions:
                      aggregateMeanings.length > 0
                        ? aggregateMeanings
                        : definitionsArr,
                  });
                } else {
                  const existing = this.dictionary.get(hanziForm)!;
                  if (!existing.hskLevel && hskLevel)
                    existing.hskLevel = hskLevel;
                  if (!existing.pinyin && pinyin) existing.pinyin = pinyin;
                  if (!existing.definition) {
                    const joined =
                      aggregateMeanings.length > 0
                        ? aggregateMeanings.join('; ')
                        : definition;
                    if (joined) existing.definition = joined;
                  }
                  if (
                    (!existing.definitions ||
                      existing.definitions.length === 0) &&
                    (aggregateMeanings.length > 0 || definitionsArr)
                  )
                    existing.definitions =
                      aggregateMeanings.length > 0
                        ? aggregateMeanings
                        : definitionsArr;
                }
                this.maxTokenLength = Math.max(
                  this.maxTokenLength,
                  hanziForm.length,
                );
              };

              addForm(hanziPrimary);
              addForm(hanziTraditional);

              // Also incorporate additional forms (beyond the first one we already processed)
              if (Array.isArray(forms)) {
                for (let i = 1; i < forms.length; i++) {
                  const f = forms[i];
                  if (f && typeof f === 'object') {
                    const formHanzi = pickString(f, [
                      'traditional',
                      't',
                      'simplified',
                      's',
                      'hanzi',
                      'term',
                      'text',
                    ]);

                    const formTranscriptions = f?.transcriptions || f?.i;
                    let formPinyin: string | undefined;
                    if (formTranscriptions) {
                      const std = pickString(formTranscriptions, [
                        'pinyin',
                        'y',
                      ]);
                      const num = pickString(formTranscriptions, [
                        'numeric',
                        'n',
                      ]);
                      formPinyin = (std || num)?.toLowerCase();
                    }
                    const normalizedFormPinyin = formPinyin;

                    const formMeanings = f?.meanings || f?.m;
                    const formDefinition =
                      Array.isArray(formMeanings) && formMeanings.length > 0
                        ? formMeanings.join('; ')
                        : undefined;
                    const formDefinitionsArr = Array.isArray(formMeanings)
                      ? formMeanings
                      : undefined;
                    // Push into aggregate list for root forms as well
                    if (
                      Array.isArray(formMeanings) &&
                      formMeanings.length > 0
                    ) {
                      for (const m of formMeanings) {
                        if (typeof m === 'string')
                          aggregateMeanings.push(m.trim());
                      }
                    }

                    if (formHanzi) {
                      if (!this.dictionary.has(formHanzi)) {
                        this.dictionary.set(formHanzi, {
                          hskLevel,
                          pinyin: normalizedFormPinyin || pinyin,
                          definition: formDefinition || definition,
                          definitions: formDefinitionsArr || definitionsArr,
                        });
                      } else {
                        const existing = this.dictionary.get(formHanzi)!;
                        if (!existing.hskLevel && hskLevel)
                          existing.hskLevel = hskLevel;
                        if (
                          !existing.pinyin &&
                          (normalizedFormPinyin || pinyin)
                        )
                          existing.pinyin = normalizedFormPinyin || pinyin;
                        if (
                          !existing.definition &&
                          (formDefinition || definition)
                        )
                          existing.definition = formDefinition || definition;
                        if (
                          (!existing.definitions ||
                            existing.definitions.length === 0) &&
                          (formDefinitionsArr || definitionsArr)
                        )
                          existing.definitions =
                            formDefinitionsArr || definitionsArr;
                      }
                      this.maxTokenLength = Math.max(
                        this.maxTokenLength,
                        formHanzi.length,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        // Ignore JSON load errors silently; DB vocabulary still provides base coverage
      }
    }

    // Reasonable cap to avoid pathological lengths
    this.maxTokenLength = Math.min(this.maxTokenLength, 16);

    // Debug: Check specific entries
    const testWords = ['仿佛', '你好', '中国'];
    for (const word of testWords) {
      const entry = this.dictionary.get(word);
      if (entry) {
        console.log(
          `✓ Found "${word}": HSK ${entry.hskLevel || 'unknown'}, pinyin: ${entry.pinyin || 'none'}`,
        );
      } else {
        console.log(`✗ Missing "${word}" in dictionary`);
      }
    }

    this.initialized = true;
    */
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
