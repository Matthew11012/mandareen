import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

interface HSKWord {
  simplified: string;
  level: string[];
  frequency?: number;
  forms?: Array<{
    traditional?: string;
    transcriptions?: {
      pinyin?: string;
    };
    meanings?: string[];
    classifiers?: string[];
  }>;
}

@Injectable()
export class HSKLevelAssignmentService {
  private readonly logger = new Logger(HSKLevelAssignmentService.name);

  constructor(private prisma: PrismaService) {}

  async assignHSKLevels(): Promise<{ message: string; stats: any }> {
    try {
      this.logger.log(
        'Starting HSK level assignment from comprehensive data...',
      );

      await this.downloadHSKData();

      await this.processHSKAssignments();

      const stats = await this.getAssignmentStats();

      return {
        message: 'HSK level assignment completed successfully',
        stats,
      };
    } catch (error) {
      this.logger.error('Error during HSK level assignment:', error);
      throw error;
    }
  }

  private async downloadHSKData(): Promise<void> {
    const dataDir = path.join(process.cwd(), 'data', 'hsk');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, 'complete-hsk.json');

    if (fs.existsSync(filePath)) {
      this.logger.log(`HSK data already exists: ${filePath}`);
      return;
    }

    this.logger.log('Downloading comprehensive HSK data...');

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);

      https
        .get(
          'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json',
          (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`Download failed: ${response.statusCode}`));
              return;
            }

            response.pipe(file);
            file.on('finish', () => {
              file.close();
              this.logger.log(`Downloaded: ${filePath}`);
              resolve();
            });
          },
        )
        .on('error', reject);
    });
  }

  private async processHSKAssignments(): Promise<void> {
    const filePath = path.join(
      process.cwd(),
      'data',
      'hsk',
      'complete-hsk.json',
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`HSK data file not found: ${filePath}`);
    }

    this.logger.log('Processing HSK level assignments...');

    const content = fs.readFileSync(filePath, 'utf-8');
    const hskData: HSKWord[] = JSON.parse(content);

    // Normalize input and precompute useful fields
    const normalized: Array<{
      hanzi: string;
      lowestLevel: number;
      frequency?: number;
      traditional?: string;
      pinyin?: string;
      definition?: string;
    }> = [];

    for (const hskWord of hskData) {
      if (!hskWord.simplified || !hskWord.level || hskWord.level.length === 0) {
        continue;
      }
      const hskLevels = this.extractHSKLevels(hskWord.level);
      if (hskLevels.length === 0) continue;
      const lowestLevel = Math.min(...hskLevels);
      const form = hskWord.forms?.[0];
      const pinyin = form?.transcriptions?.pinyin || '';
      const meanings = form?.meanings || [];
      const definition = meanings.length > 0 ? meanings.join('; ') : undefined;
      normalized.push({
        hanzi: hskWord.simplified,
        lowestLevel,
        frequency: hskWord.frequency || undefined,
        traditional: form?.traditional || undefined,
        pinyin: pinyin || undefined,
        definition,
      });
    }

    if (normalized.length === 0) {
      this.logger.log('No valid HSK entries to process.');
      return;
    }

    const BATCH = 2000;
    let processed = 0;
    let updated = 0;
    for (let i = 0; i < normalized.length; i += BATCH) {
      const chunk = normalized.slice(i, i + BATCH);
      const hanziList = chunk.map((c) => c.hanzi);

      // Fetch existing words in one query
      const existing = await this.prisma.vocabularyItem.findMany({
        where: { hanzi: { in: hanziList } },
        select: { id: true, hanzi: true, definition: true, traditional: true },
      });
      const existingMap = new Map(existing.map((e) => [e.hanzi, e]));

      const toCreate: Array<{
        hanzi: string;
        pinyin: string;
        definition: string;
        hskLevel: number;
        frequency?: number | null;
        traditional?: string | null;
        source: string;
        isCustom: boolean;
      }> = [];
      const toUpdate: Array<{
        hanzi: string;
        data: any;
      }> = [];

      for (const c of chunk) {
        const ex = existingMap.get(c.hanzi);
        if (!ex) {
          const pinyin = (c.pinyin || '').toLowerCase();
          const definition = c.definition || 'Chinese word';
          toCreate.push({
            hanzi: c.hanzi,
            pinyin,
            definition,
            hskLevel: c.lowestLevel,
            frequency: typeof c.frequency === 'number' ? c.frequency : null,
            traditional: c.traditional || c.hanzi,
            source: 'HSK_COMPLETE',
            isCustom: false,
          });
        } else {
          const data: any = {
            hskLevel: c.lowestLevel,
            frequency: typeof c.frequency === 'number' ? c.frequency : null,
            traditional: c.traditional || ex.traditional || undefined,
            source: 'HSK_COMPLETE',
          };
          if (ex.definition === 'Chinese word' && c.definition) {
            data.definition = c.definition;
          }
          toUpdate.push({ hanzi: c.hanzi, data });
        }
      }

      await this.prisma.$transaction(async (tx) => {
        if (toCreate.length > 0) {
          await tx.vocabularyItem.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
          updated += toCreate.length;
        }
        for (const u of toUpdate) {
          const res = await tx.vocabularyItem.updateMany({
            where: { hanzi: u.hanzi },
            data: u.data,
          });
          updated += res.count;
        }
      });

      processed += chunk.length;
      this.logger.log(
        `Processed ${processed} HSK words (batch ${i / BATCH + 1}), total updated/created so far: ${updated}`,
      );
    }

    this.logger.log(
      `HSK assignment completed: processed ${processed}, updated ${updated}`,
    );
  }

  private extractHSKLevels(levels: string[]): number[] {
    const hskLevels: number[] = [];

    for (const level of levels) {
      if (level.startsWith('new-')) {
        const levelStr = level.replace('new-', '');

        // Handle "new-7+" (advanced levels 7-9)
        if (levelStr.includes('+') || levelStr === '7+') {
          hskLevels.push(7);
        } else {
          const levelNum = parseInt(levelStr);
          if (levelNum >= 1 && levelNum <= 9) {
            hskLevels.push(levelNum);
          }
        }
      }
    }

    // Only use old HSK if no new HSK levels found
    if (hskLevels.length === 0) {
      for (const level of levels) {
        if (level.startsWith('old-')) {
          const oldLevel = parseInt(level.replace('old-', ''));
          if (oldLevel >= 1 && oldLevel <= 6) {
            hskLevels.push(oldLevel);
          }
        }
      }
    }

    return [...new Set(hskLevels)];
  }

  private async getAssignmentStats(): Promise<any> {
    const [totalWords, hskWords, levelDistribution] = await Promise.all([
      this.prisma.vocabularyItem.count(),
      this.prisma.vocabularyItem.count({ where: { hskLevel: { not: null } } }),
      this.prisma.vocabularyItem.groupBy({
        by: ['hskLevel'],
        _count: { id: true },
        where: { hskLevel: { not: null } },
      }),
    ]);

    return {
      totalWords,
      hskWords,
      nonHskWords: totalWords - hskWords,
      levelDistribution: levelDistribution
        .sort((a, b) => (a.hskLevel || 0) - (b.hskLevel || 0))
        .reduce(
          (acc, item) => {
            acc[`HSK ${item.hskLevel}`] = item._count.id;
            return acc;
          },
          {} as Record<string, number>,
        ),
    };
  }
}
