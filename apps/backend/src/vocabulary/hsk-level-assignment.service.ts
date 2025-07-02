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
  }>;
}

@Injectable()
export class HSKLevelAssignmentService {
  private readonly logger = new Logger(HSKLevelAssignmentService.name);

  constructor(private prisma: PrismaService) {}

  async assignHSKLevels(): Promise<{ message: string; stats: any }> {
    try {
      this.logger.log('Starting HSK level assignment from comprehensive data...');
      
      await this.downloadHSKData();
      
      await this.processHSKAssignments();
      
      const stats = await this.getAssignmentStats();
      
      return {
        message: 'HSK level assignment completed successfully',
        stats
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
      
      https.get('https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json', (response) => {
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
      }).on('error', reject);
    });
  }

  private async processHSKAssignments(): Promise<void> {
    const filePath = path.join(process.cwd(), 'data', 'hsk', 'complete-hsk.json');
    
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
        where: { hanzi: hskWord.simplified }
      });

      if (existingWord) {
        // Update with HSK level (use the lowest/most basic level)
        const lowestLevel = Math.min(...hskLevels);
        
        await this.prisma.vocabularyItem.update({
          where: { id: existingWord.id },
          data: {
            hskLevel: lowestLevel,
            frequency: hskWord.frequency || null,
            traditional: hskWord.forms?.[0]?.traditional || existingWord.traditional,
            source: 'HSK_COMPLETE'
          }
        });
        updated++;
      } else {
        // Create new entry with basic info (no definition to avoid overwriting CEDICT)
        const form = hskWord.forms?.[0];
        const pinyin = form?.transcriptions?.pinyin || '';
        
        if (pinyin) {
          await this.prisma.vocabularyItem.create({
            data: {
              hanzi: hskWord.simplified,
              pinyin: pinyin.toLowerCase(),
              definition: 'Chinese word', // Placeholder - will be enhanced by CEDICT matching
              hskLevel: Math.min(...hskLevels),
              frequency: hskWord.frequency || null,
              traditional: form?.traditional || hskWord.simplified,
              source: 'HSK_COMPLETE',
              isCustom: false
            }
          });
          updated++;
        }
      }

      processed++;
      
      if (processed % 1000 === 0) {
        this.logger.log(`Processed ${processed} HSK words, updated ${updated} vocabulary items`);
      }
    }

    this.logger.log(`HSK assignment completed: processed ${processed}, updated ${updated}`);
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

  private mapOldToNewHSK(oldLevel: number): number {
    const mapping: { [key: number]: number } = {
      1: 1,  // Old HSK 1 ≈ New HSK 1
      2: 2,  // Old HSK 2 ≈ New HSK 2  
      3: 3,  // Old HSK 3 ≈ New HSK 3
      4: 4,  // Old HSK 4 ≈ New HSK 4
      5: 5,  // Old HSK 5 ≈ New HSK 5
      6: 6   // Old HSK 6 ≈ New HSK 6
    };
    
    return mapping[oldLevel] || oldLevel;
  }

  private async getAssignmentStats(): Promise<any> {
    const [
      totalWords,
      hskWords,
      levelDistribution,
    ] = await Promise.all([
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
        .reduce((acc, item) => {
          acc[`HSK ${item.hskLevel}`] = item._count.id;
          return acc;
        }, {} as Record<string, number>)
    };
  }
} 