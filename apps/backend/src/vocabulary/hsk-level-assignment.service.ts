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

    let processed = 0;
    let updated = 0;

    for (const hskWord of hskData) {
      if (!hskWord.simplified || !hskWord.level || hskWord.level.length === 0) {
        continue;
      }

      const hskLevels = this.extractHSKLevels(hskWord.level);

      if (hskLevels.length === 0) {
        continue;
      }

      const existingWord = await this.prisma.vocabularyItem.findFirst({
        where: { hanzi: hskWord.simplified },
      });

      if (existingWord) {
        // Update with HSK level (use the lowest/most basic level)
        const lowestLevel = Math.min(...hskLevels);

        // Extract definition from HSK meanings if the current definition is placeholder
        const form = hskWord.forms?.[0];
        const meanings = form?.meanings || [];
        const hskDefinition = meanings.length > 0 ? meanings.join('; ') : null;

        const updateData: any = {
          hskLevel: lowestLevel,
          frequency: hskWord.frequency || null,
          traditional: form?.traditional || existingWord.traditional,
          source: 'HSK_COMPLETE',
        };

        // Only update definition if current one is placeholder and we have HSK meanings
        if (existingWord.definition === 'Chinese word' && hskDefinition) {
          updateData.definition = hskDefinition;
        }

        await this.prisma.vocabularyItem.update({
          where: { id: existingWord.id },
          data: updateData,
        });
        updated++;
      } else {
        // Create new entry with basic info, using meanings from HSK data when available
        const form = hskWord.forms?.[0];
        const pinyin = form?.transcriptions?.pinyin || '';

        if (pinyin) {
          // Extract definition from meanings array, join multiple meanings with semicolons
          const meanings = form?.meanings || [];
          const definition =
            meanings.length > 0 ? meanings.join('; ') : 'Chinese word'; 

          await this.prisma.vocabularyItem.create({
            data: {
              hanzi: hskWord.simplified,
              pinyin: pinyin.toLowerCase(),
              definition: definition,
              hskLevel: Math.min(...hskLevels),
              frequency: hskWord.frequency || null,
              traditional: form?.traditional || hskWord.simplified,
              source: 'HSK_COMPLETE',
              isCustom: false,
            },
          });
          updated++;
        }
      }

      processed++;

      if (processed % 1000 === 0) {
        this.logger.log(
          `Processed ${processed} HSK words, updated ${updated} vocabulary items`,
        );
      }
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
