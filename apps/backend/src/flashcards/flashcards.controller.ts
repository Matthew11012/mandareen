import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
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
      vocabPinyin?: string;
      vocabDefinition?: string;
      vocabHskLevel?: number;
    },
  ) {
    const userId = req.user.id;

    let vocabId = body.vocabId;
    if (!vocabId && body.hanzi) {
      const vocab = await this.service.ensureVocabByHanzi(body.hanzi.trim(), {
        pinyin: body.vocabPinyin || body.sentencePinyin,
        definition: body.vocabDefinition || body.sentenceTranslation,
        hskLevel:
          typeof body.vocabHskLevel === 'number'
            ? body.vocabHskLevel
            : undefined,
      });
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

  @Get()
  async listAll(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('cursorCreatedAt') cursorCreatedAt?: string,
    @Query('cursorId') cursorId?: string,
  ) {
    const userId = req.user.id;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const cursor =
      cursorCreatedAt && cursorId
        ? { createdAt: new Date(cursorCreatedAt), id: parseInt(cursorId, 10) }
        : undefined;

    return this.service.listAll(userId, limitNum, cursor);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const deleted = await this.service.deleteFlashcard(userId, Number(id));
    return { deleted };
  }

  @Post('bulk-delete')
  async bulkDelete(
    @Body() body: { ids: number[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const deleted = await this.service.deleteMany(userId, body.ids);
    return { deleted };
  }
}
