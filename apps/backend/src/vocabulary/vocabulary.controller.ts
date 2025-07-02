import { Controller, Post, Body, Get, Param, UseGuards, Req } from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { SegmentationService } from './segmentation.service';
import { CreateWordInstanceDto } from './dto/create-word-instance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('vocabulary')
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(
    private vocabularyService: VocabularyService,
    private segmentationService: SegmentationService,
  ) {}

  @Post('segment')
  async segmentText(@Body('text') text: string) {
    return this.segmentationService.segmentText(text);
  }

  @Post('lookup')
  async lookupWord(@Body('hanzi') hanzi: string) {
    return this.vocabularyService.findVocabularyItem(hanzi);
  }

  @Post('word-instance')
  async createWordInstance(
    @Req() req,
    @Body() createDto: CreateWordInstanceDto,
  ) {
    // Find or create vocabulary item
    let vocabItem = await this.vocabularyService.findVocabularyItem(createDto.hanzi);
    
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
  async searchVocabulary(@Param('query') query: string) {
    return this.vocabularyService.searchVocabulary(query);
  }
}
