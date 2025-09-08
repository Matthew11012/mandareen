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

  async searchVocabulary(query: string, limit: number = 20): Promise<any> {
    return await Promise.resolve(
      this.prisma.vocabularyItem.findMany({
        where: {
          OR: [
            { hanzi: { contains: query } },
            { pinyin: { contains: query } },
            { definition: { contains: query } },
          ],
        },
        take: limit,
      }),
    );
  }
}
