// Mock music-metadata module (uses manual mock from __mocks__)
jest.mock('music-metadata');

import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsService } from '../../../src/conversations/conversations.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SegmentationService } from '../../../src/vocabulary/segmentation.service';
import { OpenAIService } from '../../../src/openai/openai.service';
import { RagService } from '../../../src/rag/rag.service';
import { UsageService } from '../../../src/billing/usage.service';
import { BillingPlanService } from '../../../src/billing/billing-plan.service';

describe('ConversationsService - Segment Persistence', () => {
  let service: ConversationsService;

  const mockPrismaService = {
    conversation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSegmentationService = {
    segmentText: jest.fn(),
  };

  const mockOpenAIService = {};
  const mockRagService = {};
  const mockUsageService = {};
  const mockBillingPlanService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SegmentationService,
          useValue: mockSegmentationService,
        },
        {
          provide: OpenAIService,
          useValue: mockOpenAIService,
        },
        {
          provide: RagService,
          useValue: mockRagService,
        },
        {
          provide: UsageService,
          useValue: mockUsageService,
        },
        {
          provide: BillingPlanService,
          useValue: mockBillingPlanService,
        },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listMessages - Segment Persistence', () => {
    it('should use stored segments from database when available', async () => {
      const storedSegments = [
        {
          text: '你好',
          startIndex: 0,
          endIndex: 2,
          isWord: true,
          hskLevel: 1,
          pinyin: 'nǐ hǎo',
          definition: 'hello',
        },
      ];

      const messages = [
        {
          id: 1,
          conversationId: 1,
          role: 'user',
          hanzi: '你好',
          pinyin: 'nǐ hǎo',
          translation: 'hello',
          audioUrl: null,
          createdAt: new Date(),
          notes: null,
          segments: storedSegments, // Stored segments
        },
      ];

      mockPrismaService.message.findMany.mockResolvedValue(messages);

      const result = await service.listMessages(1);

      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 1 },
        orderBy: { createdAt: 'asc' },
      });
      expect(mockSegmentationService.segmentText).not.toHaveBeenCalled();
      expect(result[0].segments).toEqual(storedSegments);
    });

    it('should compute segments for old messages without stored segments (lazy backfill)', async () => {
      const messages = [
        {
          id: 1,
          conversationId: 1,
          role: 'user',
          hanzi: '你好',
          pinyin: 'nǐ hǎo',
          translation: 'hello',
          audioUrl: null,
          createdAt: new Date(),
          notes: null,
          segments: null, // Old message without segments
        },
      ];

      const computedSegments = [
        {
          word: '你好',
          startIndex: 0,
          endIndex: 2,
          isWord: true,
          hskLevel: 1,
          pinyin: 'nǐ hǎo',
          definition: 'hello',
          definitions: ['hello'],
        },
      ];

      mockPrismaService.message.findMany.mockResolvedValue(messages);
      mockSegmentationService.segmentText.mockResolvedValue(computedSegments);
      mockPrismaService.message.update.mockResolvedValue({
        ...messages[0],
        segments: computedSegments,
      });

      const result = await service.listMessages(1);

      expect(mockSegmentationService.segmentText).toHaveBeenCalledWith('你好');
      expect(mockPrismaService.message.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { segments: expect.any(Array) },
      });
      expect(result[0].segments).toBeDefined();
    });

    it('should handle messages without Chinese characters', async () => {
      const messages = [
        {
          id: 1,
          conversationId: 1,
          role: 'user',
          hanzi: 'Hello',
          pinyin: '',
          translation: 'Hello',
          audioUrl: null,
          createdAt: new Date(),
          notes: null,
          segments: null,
        },
      ];

      mockPrismaService.message.findMany.mockResolvedValue(messages);

      const result = await service.listMessages(1);

      expect(mockSegmentationService.segmentText).not.toHaveBeenCalled();
      // segments is null from DB for non-Chinese messages, not undefined
      expect(result[0].segments).toBeNull();
    });
  });

  describe('sendUserMessage - Segment Persistence', () => {
    it('should save segments when creating user message', async () => {
      const computedSegments = [
        {
          word: '你好',
          startIndex: 0,
          endIndex: 2,
          isWord: true,
          hskLevel: 1,
          pinyin: 'nǐ hǎo',
          definition: 'hello',
          definitions: ['hello'],
        },
      ];

      mockPrismaService.conversation.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      });
      mockSegmentationService.segmentText.mockResolvedValue(computedSegments);
      mockPrismaService.message.create.mockResolvedValue({
        id: 1,
        conversationId: 1,
        role: 'user',
        hanzi: '你好',
        pinyin: '',
        translation: '',
        segments: computedSegments,
      });

      await service.sendUserMessage({
        conversationId: 1,
        userId: 1,
        hanzi: '你好',
      });

      expect(mockPrismaService.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hanzi: '你好',
          segments: expect.any(Array),
        }),
      });
    });
  });
});
