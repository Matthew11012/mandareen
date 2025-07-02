import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as readline from 'readline';

@Injectable()
export class DictionaryImportService {
  private readonly logger = new Logger(DictionaryImportService.name);

  constructor(private prisma: PrismaService) {}

  async importCCCEDICT(filePath: string): Promise<void> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const batchSize = 1000;
    let batch: any[] = [];
    let totalProcessed = 0;

    for await (const line of rl) {
      if (line.startsWith('#') || line.trim() === '') continue;

      const entry = this.parseCCCEDICTLine(line);
      if (entry) {
        batch.push(entry);
        
        if (batch.length >= batchSize) {
          await this.insertBatch(batch);
          totalProcessed += batch.length;
          this.logger.log(`Processed ${totalProcessed} entries`);
          batch = [];
        }
      }
    }

    // Insert remaining entries
    if (batch.length > 0) {
      await this.insertBatch(batch);
      totalProcessed += batch.length;
    }

    this.logger.log(`Import completed. Total entries: ${totalProcessed}`);
  }

  private parseCCCEDICTLine(line: string): any {
    // CC-CEDICT format: Traditional Simplified [pin1 yin1] /definition1/definition2/
    const match = line.match(/^(.+?)\s+(.+?)\s+\[(.+?)\]\s+\/(.+)\//);
    
    if (!match) return null;

    const [, traditional, simplified, pinyin, definitions] = match;
    const definitionList = definitions.split('/').filter(d => d.trim());

    return {
      hanzi: simplified,
      pinyin: pinyin,
      definition: definitionList.join('; '),
      isCustom: false,
    };
  }

  private async insertBatch(entries: any[]): Promise<void> {
    try {
      await this.prisma.vocabularyItem.createMany({
        data: entries,
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.error('Error inserting batch:', error);
    }
  }

  async importHSKLevels(hskData: Array<{ hanzi: string; level: number }>): Promise<void> {
    for (const item of hskData) {
      await this.prisma.vocabularyItem.updateMany({
        where: { hanzi: item.hanzi },
        data: { hskLevel: item.level },
      });
    }
  }
}
