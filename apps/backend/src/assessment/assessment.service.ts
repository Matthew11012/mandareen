import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { Passage } from './models/passage.model';
import { FetchQuestionsDto } from './dto/fetch-questions.dto';
import {
  SubmitAssessmentDto,
  WordKnowledgeLevel,
} from './dto/submit-assessment.dto';
import { SegmentationService } from '../vocabulary/segmentation.service';

@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    private prisma: PrismaService,
    private openaiService: OpenAIService,
    private segmentationService: SegmentationService,
  ) {}

  async fetchAssessmentQuestions(
    userId: number,
    dto: FetchQuestionsDto,
  ): Promise<Passage[]> {
    try {
      const { maxLevel = 7, passageCount = 4 } = dto;

      const levelDistribution = this.calculateLevelDistribution(
        maxLevel,
        passageCount,
      );

      const passagePromises = levelDistribution.map((level) =>
        this.openaiService.generateAssessmentPassage(level),
      );

      const passages = await Promise.all(passagePromises);

      // Segment each passage and add vocabulary metadata
      const enrichedPassages = await Promise.all(
        passages.map(async (passage) => {
          const segments = await this.segmentationService.segmentText(
            passage.content,
          );
          return {
            ...passage,
            segments: segments,
            vocabularyItems: segments
              .filter((s) => s.vocabItem)
              .map((s) => s.vocabItem),
          };
        }),
      );

      // Store assessment session in cache or DB if needed

      return enrichedPassages;
    } catch (error) {
      this.logger.error('Error fetching assessment questions:', error);
      throw new Error(`Failed to fetch assessment questions: ${error.message}`);
    }
  }

  async submitAssessment(
    userId: number,
    dto: SubmitAssessmentDto,
  ): Promise<{ levelPlaced: number }> {
    try {
      const levelPlaced = this.calculatePlacementLevel(dto.wordAssessments);

      await this.prisma.assessment.create({
        data: {
          userId,
          levelPlaced,
        },
      });

      return { levelPlaced };
    } catch (error) {
      this.logger.error('Error submitting assessment:', error);
      throw new Error(`Failed to submit assessment: ${error.message}`);
    }
  }

  private calculatePlacementLevel(
    wordAssessments: SubmitAssessmentDto['wordAssessments'],
  ): number {
    const wordsByLevel = new Map<
      number,
      { unknown: number; partial: number; total: number }
    >();

    for (let level = 1; level <= 7; level++) {
      wordsByLevel.set(level, { unknown: 0, partial: 0, total: 0 });
    }

    // Count words by knowledge level
    for (const assessment of wordAssessments) {
      const levelStats = wordsByLevel.get(assessment.hskLevel);
      if (levelStats) {
        levelStats.total++;

        if (assessment.knowledge === WordKnowledgeLevel.UNKNOWN) {
          levelStats.unknown++;
        } else if (assessment.knowledge === WordKnowledgeLevel.PARTIAL) {
          levelStats.partial++;
        }
      }
    }

    // Calculate weighted unknown ratio for each level
    const PARTIAL_WEIGHT = 0.5;
    const MAX_RATIOS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

    let placementLevel = 0;

    // Find the highest level where the ratio is below the threshold
    for (let level = 1; level <= 7; level++) {
      const stats = wordsByLevel.get(level);

      // Skip levels with no words
      if (!stats || stats.total === 0) continue;

      const weightedUnknownRatio =
        (stats.unknown + PARTIAL_WEIGHT * stats.partial) / stats.total;
      const maxRatio = MAX_RATIOS[level - 1];

      if (weightedUnknownRatio <= maxRatio) {
        placementLevel = level;
      } else {
        break;
      }
    }

    // Special case for below HSK 1
    const level1Stats = wordsByLevel.get(1);
    if (level1Stats && level1Stats.total > 0) {
      const level1Ratio = level1Stats.unknown / level1Stats.total;
      if (level1Ratio > 0.2) {
        return 0; // Below HSK 1
      }
    }

    return placementLevel;
  }

  private calculateLevelDistribution(
    maxLevel: number,
    passageCount: number,
  ): number[] {
    const distribution: number[] = [];

    // Simple distribution algorithm: try to cover all levels up to maxLevel
    if (passageCount >= maxLevel) {
      for (let i = 1; i <= maxLevel; i++) {
        distribution.push(i);
      }

      // Fill remaining slots with middle levels
      const remaining = passageCount - maxLevel;
      const middleLevel = Math.floor(maxLevel / 2);
      for (let i = 0; i < remaining; i++) {
        distribution.push(middleLevel + (i % 2 === 0 ? 1 : -1));
      }
    } else {
      // Not enough passages for all levels, distribute evenly
      const step = maxLevel / passageCount;
      for (let i = 0; i < passageCount; i++) {
        distribution.push(Math.ceil((i + 1) * step));
      }
    }

    return distribution.slice(0, passageCount);
  }
}
