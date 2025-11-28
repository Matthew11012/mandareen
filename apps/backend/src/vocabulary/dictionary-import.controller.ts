import { Controller, Post, Get, UseGuards, Logger } from '@nestjs/common';
import { DictionaryImportService } from './dictionary-import.service';
import { HSKLevelAssignmentService } from './hsk-level-assignment.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('dictionary')
@UseGuards(AuthGuard)
export class DictionaryImportController {
  private readonly logger = new Logger(DictionaryImportController.name);

  constructor(
    private dictionaryImportService: DictionaryImportService,
    private hskLevelAssignmentService: HSKLevelAssignmentService
  ) {}

  @Post('full-import')
  async fullDictionaryImport() {
    this.logger.log('Starting full dictionary import process');
    return this.dictionaryImportService.fullDictionaryImport();
  }

  @Post('add-sample-data')
  async addSampleData() {
    this.logger.log('Adding sample vocabulary data');
    await this.dictionaryImportService.addSampleData();
    return { message: 'Sample data added successfully' };
  }

  @Post('assign-hsk-levels')
  async assignHSKLevels() {
    this.logger.log('Starting HSK level assignment from comprehensive data');
    return this.hskLevelAssignmentService.assignHSKLevels();
  }

  @Get('stats')
  async getDictionaryStats() {
    return this.dictionaryImportService.getDictionaryStats();
  }
}
