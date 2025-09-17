import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIService,
  ) {}

  async startConversation(userId: number) {
    const convo = await this.prisma.conversation.create({
      data: {
        userId,
      },
    });
    return convo;
  }

  async listMessages(conversationId: number) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendUserMessage({
    conversationId,
    userId,
    hanzi,
  }: {
    conversationId: number;
    userId: number;
    hanzi: string;
  }) {
    // Verify conversation ownership
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!convo) throw new Error('Conversation not found');

    const userMsg = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        hanzi,
        pinyin: '',
        translation: '',
      },
    });

    // Generate AI reply
    const ai = await this.openai.chatChineseReply(hanzi);

    const aiMsg = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'ai',
        hanzi: ai.hanzi,
        pinyin: ai.pinyin,
        translation: ai.translation,
      },
    });

    return { user: userMsg, ai: aiMsg };
  }
}
