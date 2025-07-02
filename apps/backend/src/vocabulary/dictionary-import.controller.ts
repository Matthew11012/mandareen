import { Controller, Post, Get, Body, UseGuards, Logger } from '@nestjs/common';
import { DictionaryImportService } from './dictionary-import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('dictionary')
@UseGuards(JwtAuthGuard) // Protect admin endpoints
export class DictionaryImportController {
  private readonly logger = new Logger(DictionaryImportController.name);

  constructor(private dictionaryImportService: DictionaryImportService) {}

  @Post('full-import')
  async fullDictionaryImport() {
    this.logger.log('Starting full dictionary import process');
    return this.dictionaryImportService.fullDictionaryImport();
  }

  @Post('import-cedict')
  async importCCCEDICT(@Body('filePath') filePath: string) {
    this.logger.log(`Starting CC-CEDICT import from: ${filePath}`);
    await this.dictionaryImportService.importCCCEDICT(filePath);
    return { message: 'CC-CEDICT import completed successfully' };
  }

  @Post('import-hsk')
  async importHSKLevels(@Body() hskData: Array<{ hanzi: string; level: number }>) {
    this.logger.log(`Importing HSK levels for ${hskData.length} words`);
    await this.dictionaryImportService.importHSKLevels(hskData);
    return { message: 'HSK levels imported successfully' };
  }

  @Post('add-sample-data')
  async addSampleData() {
    this.logger.log('Adding sample vocabulary data');
    await this.dictionaryImportService.addSampleData();
    return { message: 'Sample data added successfully' };
  }

  @Get('stats')
  async getDictionaryStats() {
    return this.dictionaryImportService.getDictionaryStats();
  }
}
