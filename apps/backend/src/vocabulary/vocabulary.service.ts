import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VocabularyService {
  private readonly logger = new Logger(VocabularyService.name);

  constructor(private prisma: PrismaService) {}

  async findVocabularyItem(hanzi: string): Promise<any> {
    return await Promise.resolve(
      this.prisma.vocabularyItem.findFirst({
        where: { hanzi },
        include: {
          senses: {
            select: { id: true, pinyin: true, definition: true },
            orderBy: { id: 'asc' },
          },
        },
      }),
    );
  }

  async createVocabularyItem(data: {
    hanzi: string;
    pinyin: string;
    definition: string;
    hskLevel?: number;
    isCustom?: boolean;
  }): Promise<any> {
    return await Promise.resolve(
      this.prisma.vocabularyItem.create({
        data: {
          ...data,
          isCustom: data.isCustom ?? false,
        },
      }),
    );
  }

  async createWordInstance(data: {
    vocabId: number;
    startIndex: number;
    endIndex: number;
    context: string;
    sectionId?: number;
    messageId?: number;
  }): Promise<any> {
    // Filter out undefined values
    const cleanData: any = {
      vocabId: data.vocabId,
      startIndex: data.startIndex,
      endIndex: data.endIndex,
      context: data.context,
    };

    if (data.sectionId !== undefined) {
      cleanData.sectionId = data.sectionId;
    }

    if (data.messageId !== undefined) {
      cleanData.messageId = data.messageId;
    }

    return await Promise.resolve(
      this.prisma.wordInstance.create({
        data: cleanData,
        include: {
          vocab: true,
        },
      }),
    );
  }

  async searchVocabulary(
    query: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<{ items: any[]; nextCursor?: string }> {
    const where = {
      OR: [
        { hanzi: { contains: query, mode: 'insensitive' } },
        { pinyin: { contains: query, mode: 'insensitive' } },
        { definition: { contains: query, mode: 'insensitive' } },
      ],
    } as any;

    // Use simple id-based keyset so we strictly append after last id
    const params: any = {
      where,
      orderBy: { id: 'asc' },
      take: limit,
    };
    if (cursor) {
      const id = parseInt(cursor, 10);
      if (!isNaN(id)) {
        params.cursor = { id };
        params.skip = 1;
      }
    }
    const items = await this.prisma.vocabularyItem.findMany(params);
    const next =
      items.length === limit ? String(items[items.length - 1].id) : undefined;
    return { items, nextCursor: next };
  }
}
