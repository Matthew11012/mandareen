import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { SegmentationService } from './segmentation.service';
import { CreateWordInstanceDto } from './dto/create-word-instance.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('vocabulary')
@UseGuards(AuthGuard)
export class VocabularyController {
  constructor(
    private vocabularyService: VocabularyService,
    private segmentationService: SegmentationService,
  ) {}

  @Post('segment')
  async segmentText(@Body('text') text: string): Promise<any> {
    return this.segmentationService.segmentText(text);
  }

  @Post('lookup')
  async lookupWord(@Body('hanzi') hanzi: string): Promise<any> {
    return this.vocabularyService.findVocabularyItem(hanzi);
  }

  @Post('word-instance')
  async createWordInstance(
    @Req() req,
    @Body() createDto: CreateWordInstanceDto,
  ): Promise<any> {
    // Find or create vocabulary item
    let vocabItem = await this.vocabularyService.findVocabularyItem(
      createDto.hanzi,
    );

    if (!vocabItem) {
      // Create custom vocabulary item
      vocabItem = await this.vocabularyService.createVocabularyItem({
        hanzi: createDto.hanzi,
        pinyin: '', // You might want to generate this
        definition: '', // Allow user to add later
        isCustom: true,
      });
    }

    return this.vocabularyService.createWordInstance({
      vocabId: vocabItem.id,
      startIndex: createDto.startIndex,
      endIndex: createDto.endIndex,
      context: createDto.context,
      sectionId: createDto.sectionId,
      messageId: createDto.messageId,
    });
  }

  @Get('search/:query')
  async searchVocabulary(
    @Param('query') query: string,
    @Req() req: any,
  ): Promise<any> {
    const limitNum = parseInt((req?.query?.limit as string) || '20', 10);
    const limit = Math.min(Math.max(isNaN(limitNum) ? 20 : limitNum, 1), 100);
    const cursor = (req?.query?.cursor as string) || undefined;
    // Parse HSK levels: supports hsk=1&hsk=2 or hsk=1,2
    let hskLevels: number[] | undefined = undefined;
    const rawHsk = req?.query?.hsk as undefined | string | string[];
    if (typeof rawHsk === 'string') {
      const parts = rawHsk.split(',').map((s) => parseInt(s.trim(), 10));
      const vals = parts.filter((n) => !isNaN(n));
      if (vals.length > 0) hskLevels = vals;
    } else if (Array.isArray(rawHsk)) {
      const vals = rawHsk
        .flatMap((item) =>
          String(item)
            .split(',')
            .map((s) => parseInt(s.trim(), 10)),
        )
        .filter((n) => !isNaN(n));
      if (vals.length > 0) hskLevels = vals;
    }
    const exactParam = (req?.query?.exact as string) || undefined;
    const exact = exactParam === '1' || exactParam === 'true';
    return this.vocabularyService.searchVocabulary(
      query,
      limit,
      cursor,
      hskLevels,
      exact,
    );
  }
}
