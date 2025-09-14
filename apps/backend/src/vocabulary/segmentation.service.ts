import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export interface SegmentResult {
  word: string;
  startIndex: number;
  endIndex: number;
  isWord: boolean;
  hskLevel?: number;
  pinyin?: string;
  definition?: string;
}

@Injectable()
export class SegmentationService {
  constructor(private prisma: PrismaService) {}

  private initialized = false;
  private dictionary = new Map<
    string,
    { hskLevel?: number; pinyin?: string; definition?: string }
  >();
  private maxTokenLength = 6;

  private async initializeDictionary(): Promise<void> {
    if (this.initialized) return;

    console.log('🔍 [SegmentationService] Initializing HSK dictionary...');

    // 1) Load vocabulary from DB
    const vocabularyItems = await this.prisma.vocabularyItem.findMany({
      select: { hanzi: true, pinyin: true, definition: true, hskLevel: true },
    });
    for (const item of vocabularyItems) {
      if (!item.hanzi) continue;
      this.dictionary.set(item.hanzi, {
        hskLevel: item.hskLevel ?? undefined,
        pinyin: item.pinyin ?? undefined,
        definition: item.definition ?? undefined,
      });
      this.maxTokenLength = Math.max(this.maxTokenLength, item.hanzi.length);
    }

    // 2) Load HSK JSON dictionaries (best-effort)
    const candidatePaths = [
      // Monorepo root
      path.resolve(process.cwd(), 'apps/backend/data/hsk/complete-hsk.json'),
      path.resolve(process.cwd(), 'apps/backend/data/hsk/complete.json'),
      path.resolve(process.cwd(), 'apps/backend/data/hsk/complete.min.json'),
      path.resolve(process.cwd(), 'apps/backend/data/hsk-levels.json'),
      // Compiled dist-relative
      path.resolve(__dirname, '../../data/hsk/complete-hsk.json'),
      path.resolve(__dirname, '../../data/hsk/complete.json'),
      path.resolve(__dirname, '../../data/hsk/complete.min.json'),
      path.resolve(__dirname, '../../data/hsk-levels.json'),
    ];

    for (const filePath of candidatePaths) {
      try {
        if (fs.existsSync(filePath)) {
          console.log(`📂 Found HSK file: ${filePath}`);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          console.log(
            `📊 Loaded ${Array.isArray(data) ? data.length : 'unknown'} entries from HSK file`,
          );

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
                  return val.trim();
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
                  for (const item of val) {
                    if (typeof item === 'string') {
                      const m = item.match(/\d+/);
                      if (m) return parseInt(m[0], 10);
                    }
                    if (typeof item === 'number') return item;
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
              let hanziTraditional: string | undefined;

              const forms = entry?.forms || [];
              if (Array.isArray(forms) && forms.length > 0) {
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
                  pinyin = pickString(transcriptions, [
                    'pinyin',
                    'y', // shortened key
                    'numeric',
                    'n', // shortened key
                  ]);
                }

                // Extract meanings
                const meanings = firstForm?.meanings || firstForm?.m; // 'm' is shortened key
                if (Array.isArray(meanings) && meanings.length > 0) {
                  definition = meanings.join('; ');
                }
              }

              const addForm = (hanziForm?: string) => {
                if (!hanziForm) return;
                if (!this.dictionary.has(hanziForm)) {
                  this.dictionary.set(hanziForm, {
                    hskLevel,
                    pinyin,
                    definition,
                  });
                } else {
                  const existing = this.dictionary.get(hanziForm)!;
                  if (!existing.hskLevel && hskLevel)
                    existing.hskLevel = hskLevel;
                  if (!existing.pinyin && pinyin) existing.pinyin = pinyin;
                  if (!existing.definition && definition)
                    existing.definition = definition;
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
                    const formPinyin = formTranscriptions
                      ? pickString(formTranscriptions, [
                          'pinyin',
                          'y',
                          'numeric',
                          'n',
                        ])
                      : undefined;

                    const formMeanings = f?.meanings || f?.m;
                    const formDefinition =
                      Array.isArray(formMeanings) && formMeanings.length > 0
                        ? formMeanings.join('; ')
                        : undefined;

                    if (formHanzi) {
                      if (!this.dictionary.has(formHanzi)) {
                        this.dictionary.set(formHanzi, {
                          hskLevel,
                          pinyin: formPinyin || pinyin,
                          definition: formDefinition || definition,
                        });
                      } else {
                        const existing = this.dictionary.get(formHanzi)!;
                        if (!existing.hskLevel && hskLevel)
                          existing.hskLevel = hskLevel;
                        if (!existing.pinyin && (formPinyin || pinyin))
                          existing.pinyin = formPinyin || pinyin;
                        if (
                          !existing.definition &&
                          (formDefinition || definition)
                        )
                          existing.definition = formDefinition || definition;
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

    console.log(
      `✅ Dictionary initialized with ${this.dictionary.size} entries`,
    );
    console.log(`🔧 Max token length: ${this.maxTokenLength}`);

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
          });
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Fallback: single Chinese character as a word segment
        segments.push({
          word: char,
          startIndex: i,
          endIndex: i + 1,
          isWord: true,
          hskLevel: localDict.get(char)?.hskLevel,
          pinyin: localDict.get(char)?.pinyin,
          definition: localDict.get(char)?.definition,
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
