import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as readline from 'readline';
import * as https from 'https';
import * as path from 'path';
import * as zlib from 'zlib';

@Injectable()
export class DictionaryImportService {
  private readonly logger = new Logger(DictionaryImportService.name);

  constructor(private prisma: PrismaService) {}

  async fullDictionaryImport(): Promise<{ message: string; stats: any }> {
    try {
      this.logger.log('Starting full dictionary import process...');
      
      const downloadPath = await this.downloadCCCEDICT();
      
      const extractedPath = await this.extractGzipFile(downloadPath);
      
      await this.importCCCEDICT(extractedPath);
      
      await this.loadAndApplyHSKLevels();
      
      const stats = await this.getDictionaryStats();
      
      this.cleanupFiles([downloadPath, extractedPath]);
      
      this.logger.log('Full dictionary import completed successfully');
      return {
        message: 'Full dictionary import completed successfully',
        stats
      };
    } catch (error) {
      this.logger.error('Error during full dictionary import:', error);
      throw new Error(`Dictionary import failed: ${error.message}`);
    }
  }

  private async extractGzipFile(gzipPath: string): Promise<string> {
    const extractedPath = gzipPath.replace('.gz', '');
    
    if (fs.existsSync(extractedPath)) {
      this.logger.log(`Extracted file already exists: ${extractedPath}`);
      return extractedPath;
    }

    this.logger.log(`Extracting gzip file: ${gzipPath}`);
    
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(gzipPath);
      const writeStream = fs.createWriteStream(extractedPath);
      const gunzip = zlib.createGunzip();

      readStream
        .pipe(gunzip)
        .pipe(writeStream)
        .on('finish', () => {
          this.logger.log(`Extraction completed: ${extractedPath}`);
          resolve(extractedPath);
        })
        .on('error', reject);
    });
  }

  private async loadAndApplyHSKLevels(): Promise<void> {
    try {
      const hskDataPath = path.join(process.cwd(), 'data', 'hsk-levels.json');
      
      if (!fs.existsSync(hskDataPath)) {
        this.logger.warn('HSK levels file not found, skipping HSK level assignment');
        return;
      }

      const hskData = JSON.parse(fs.readFileSync(hskDataPath, 'utf-8'));
      
      // Convert to flat array with levels
      const hskWords: Array<{ hanzi: string; level: number }> = [];
      
      Object.keys(hskData).forEach(levelKey => {
        const level = parseInt(levelKey.replace('hsk', ''));
        const words = hskData[levelKey];
        
        words.forEach((word: string) => {
          hskWords.push({ hanzi: word, level });
        });
      });

      this.logger.log(`Applying HSK levels to ${hskWords.length} words`);
      await this.importHSKLevels(hskWords);
      
    } catch (error) {
      this.logger.error('Error loading HSK levels:', error);
      throw error;
    }
  }

  private cleanupFiles(filePaths: string[]): void {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`Cleaned up file: ${filePath}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to cleanup file ${filePath}:`, error);
      }
    });
  }

  async importCCCEDICT(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    this.logger.log(`Starting CC-CEDICT import from: ${filePath}`);
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const batchSize = 1000;
    let batch: any[] = [];
    let totalProcessed = 0;
    let skippedLines = 0;

    for await (const line of rl) {
      if (line.startsWith('#') || line.trim() === '') {
        skippedLines++;
        continue;
      }

      const entry = this.parseCCCEDICTLine(line);
      if (entry) {
        batch.push(entry);
        
        if (batch.length >= batchSize) {
          await this.insertBatch(batch);
          totalProcessed += batch.length;
          this.logger.log(`Processed ${totalProcessed} entries`);
          batch = [];
        }
      } else {
        skippedLines++;
      }
    }

    // Insert remaining entries
    if (batch.length > 0) {
      await this.insertBatch(batch);
      totalProcessed += batch.length;
    }

    this.logger.log(`Import completed. Total entries: ${totalProcessed}, Skipped lines: ${skippedLines}`);
  }

  private parseCCCEDICTLine(line: string): any {
    // CC-CEDICT format: Traditional Simplified [pin1 yin1] /definition1/definition2/
    const match = line.match(/^(.+?)\s+(.+?)\s+\[(.+?)\]\s+\/(.+)\//);
    
    if (!match) return null;

    const [, traditional, simplified, pinyin, definitions] = match;
    const definitionList = definitions.split('/').filter(d => d.trim());

    // Skip entries that are too long or contain non-Chinese characters
    if (simplified.length > 10 || !/^[\u4e00-\u9fff]+$/.test(simplified)) {
      return null;
    }

    return {
      hanzi: simplified,
      pinyin: pinyin.toLowerCase(),
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
      throw error;
    }
  }

  async importHSKLevels(hskData: Array<{ hanzi: string; level: number }>): Promise<void> {
    const batchSize = 100;
    let updated = 0;

    for (let i = 0; i < hskData.length; i += batchSize) {
      const batch = hskData.slice(i, i + batchSize);
      
      for (const item of batch) {
        const result = await this.prisma.vocabularyItem.updateMany({
          where: { hanzi: item.hanzi },
          data: { hskLevel: item.level },
        });
        updated += result.count;
      }
      
      this.logger.log(`Updated HSK levels for ${updated} words so far...`);
    }

    this.logger.log(`HSK level assignment completed. Updated ${updated} words.`);
  }

  async downloadCCCEDICT(): Promise<string> {
    const url = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
    const downloadPath = path.join(process.cwd(), 'data', 'cedict.txt.gz');
    
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(downloadPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(downloadPath)) {
      this.logger.log(`File already exists: ${downloadPath}`);
      return downloadPath;
    }

    this.logger.log(`Downloading CC-CEDICT from: ${url}`);
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(downloadPath);
      
      const request = https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0');
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
            this.logger.log(`Download progress: ${progress}%`);
          }
        });

        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          this.logger.log(`Download completed: ${downloadPath}`);
          resolve(downloadPath);
        });
      });

      request.on('error', (err) => {
        fs.unlink(downloadPath, () => {}); // Delete partial file
        reject(err);
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  async addSampleData(): Promise<void> {
    const sampleVocabulary = [
      { hanzi: '你好', pinyin: 'nǐ hǎo', definition: 'hello; hi', hskLevel: 1 },
      { hanzi: '谢谢', pinyin: 'xiè xiè', definition: 'thank you', hskLevel: 1 },
      { hanzi: '再见', pinyin: 'zài jiàn', definition: 'goodbye', hskLevel: 1 },
      { hanzi: '世界', pinyin: 'shì jiè', definition: 'world', hskLevel: 2 },
      { hanzi: '学习', pinyin: 'xué xí', definition: 'to study; to learn', hskLevel: 2 },
      { hanzi: '朋友', pinyin: 'péng yǒu', definition: 'friend', hskLevel: 2 },
      { hanzi: '中国', pinyin: 'zhōng guó', definition: 'China', hskLevel: 1 },
      { hanzi: '英语', pinyin: 'yīng yǔ', definition: 'English language', hskLevel: 2 },
      { hanzi: '汉语', pinyin: 'hàn yǔ', definition: 'Chinese language', hskLevel: 3 },
      { hanzi: '大学', pinyin: 'dà xué', definition: 'university', hskLevel: 2 },
      // Individual characters
      { hanzi: '我', pinyin: 'wǒ', definition: 'I; me', hskLevel: 1 },
      { hanzi: '你', pinyin: 'nǐ', definition: 'you', hskLevel: 1 },
      { hanzi: '他', pinyin: 'tā', definition: 'he; him', hskLevel: 1 },
      { hanzi: '她', pinyin: 'tā', definition: 'she; her', hskLevel: 1 },
      { hanzi: '是', pinyin: 'shì', definition: 'to be; yes', hskLevel: 1 },
      { hanzi: '有', pinyin: 'yǒu', definition: 'to have; there is/are', hskLevel: 1 },
      { hanzi: '不', pinyin: 'bù', definition: 'no; not', hskLevel: 1 },
      { hanzi: '在', pinyin: 'zài', definition: 'at; in; on', hskLevel: 1 },
      { hanzi: '人', pinyin: 'rén', definition: 'person; people', hskLevel: 1 },
      { hanzi: '中', pinyin: 'zhōng', definition: 'middle; center; China', hskLevel: 1 },
    ];

    try {
      await this.prisma.vocabularyItem.createMany({
        data: sampleVocabulary.map(item => ({
          ...item,
          isCustom: false,
        })),
        skipDuplicates: true,
      });
      
      this.logger.log(`Added ${sampleVocabulary.length} sample vocabulary items`);
    } catch (error) {
      this.logger.error('Error adding sample data:', error);
      throw error;
    }
  }

  async getDictionaryStats() {
    const [
      totalWords,
      customWords,
      hskWords,
      levelDistribution,
    ] = await Promise.all([
      this.prisma.vocabularyItem.count(),
      this.prisma.vocabularyItem.count({ where: { isCustom: true } }),
      this.prisma.vocabularyItem.count({ where: { hskLevel: { not: null } } }),
      this.prisma.vocabularyItem.groupBy({
        by: ['hskLevel'],
        _count: { id: true },
        where: { hskLevel: { not: null } },
      }),
    ]);

    return {
      totalWords,
      customWords,
      hskWords,
      standardWords: totalWords - customWords,
      levelDistribution: levelDistribution.reduce((acc, item) => {
        acc[`HSK ${item.hskLevel}`] = item._count.id;
        return acc;
      }, {}),
    };
  }
}
