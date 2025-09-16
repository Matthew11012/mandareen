import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { BadRequestException } from '@nestjs/common';

@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardsController {
  constructor(private readonly service: FlashcardsService) {}

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      vocabId?: number;
      hanzi?: string;
      sourceInstanceId?: number;
      sentenceHanzi?: string;
      sentencePinyin?: string;
      sentenceTranslation?: string;
    },
  ) {
    const userId = req.user.id;

    let vocabId = body.vocabId;
    if (!vocabId && body.hanzi) {
      const vocab = await this.service.ensureVocabByHanzi(body.hanzi.trim());
      vocabId = vocab.id;
    }

    if (!vocabId) {
      throw new BadRequestException('Provide vocabId or hanzi');
    }

    const card = await this.service.addFlashcard(
      {
        userId,
        vocabId,
        sourceInstanceId: body.sourceInstanceId,
      },
      body.sentenceHanzi
        ? {
            hanzi: body.sentenceHanzi,
            pinyin: body.sentencePinyin,
            translation: body.sentenceTranslation,
          }
        : undefined,
    );
    return {
      flashcard: {
        id: card.id,
        vocabId: card.vocabId,
        nextReview: card.nextReview.toISOString(),
        intervalDays: card.intervalDays,
        easiness: card.easiness,
      },
    };
  }

  @Get('due')
  async listDue(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.service.listDue(userId);
  }

  @Post(':id/review')
  async review(@Param('id') id: string, @Body() body: { quality: number }) {
    const result = await this.service.reviewFlashcard(Number(id), body.quality);
    return result;
  }
}
