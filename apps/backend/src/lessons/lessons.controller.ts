import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { LessonsService } from './lessons.service';
import { AuthenticatedRequest } from '../types/request.types';
import { UsageService } from '../billing/usage.service';
import { BILLING_RESOURCES } from '../billing/billing-resources.constants';
import { BillingPlanService } from '../billing/billing-plan.service';
import { QuotaExceededError } from '../billing/errors/billing.errors';

type LessonAccess = 'full' | 'preview';
type PlanCode = 'FREE' | 'BASIC' | 'PREMIUM';
type LessonUnlockInfo =
  | {
      reason: 'community_quota_exceeded' | 'plan_restricted';
      planCode: PlanCode;
      remainingViews?: number | null;
    }
  | undefined;

export interface GenerateLessonDto {
  level?: number;
  type?: 'story' | 'dialogue';
  readTimeMinutes?: number; // approximate target read time
  topic?: string;
}

@Controller('lessons')
@UseGuards(AuthGuard)
export class LessonsController {
  private readonly logger = new Logger(LessonsController.name);
  private readonly lessonsService: LessonsService;
  private readonly usageService: UsageService;
  private readonly billingPlanService: BillingPlanService;

  constructor(
    lessonsService: LessonsService,
    usageService: UsageService,
    billingPlanService: BillingPlanService,
  ) {
    this.lessonsService = lessonsService;
    this.usageService = usageService;
    this.billingPlanService = billingPlanService;
  }

  /**
   * Aggregated lessons overview to reduce multiple round trips from the frontend.
   * Bundles tags, all lessons, user lessons, and finished IDs into a single payload.
   */
  @Get('overview')
  async getLessonsOverview(
    @Req() req: AuthenticatedRequest,
    @Query('level') level?: string,
    @Query('levels') levels?: string | string[],
    @Query('timeframeTags') timeframeTags?: string | string[],
    @Query('contentTags') contentTags?: string | string[],
    @Query('includeUntagged') includeUntagged?: string,
  ): Promise<{
    tags: {
      timeframe: Array<{ tag: string; count: number }>;
      content: Array<{ tag: string; count: number }>;
    };
    all: Array<{
      id: number;
      title: string | null;
      level: number;
      createdAt: string;
      lessonType: string;
      titlePinyin: string | null;
      titleTranslation: string | null;
      tags: string[];
    }>;
    mine: Array<{
      id: number;
      title: string | null;
      level: number;
      createdAt: string;
      lessonType: string;
      titlePinyin: string | null;
      titleTranslation: string | null;
      tags: string[];
    }>;
    finishedIds: number[];
  }> {
    const lvl = level ? parseInt(level, 10) : undefined;
    const levelsArr: number[] | undefined = Array.isArray(levels)
      ? (levels as string[])
          .flatMap((v) => v.split(','))
          .map((v) => parseInt(v, 10))
          .filter((n) => !isNaN(n))
      : typeof levels === 'string'
        ? levels
            .split(',')
            .map((v) => parseInt(v, 10))
            .filter((n) => !isNaN(n))
        : undefined;

    const timeframeTagsArr: string[] | undefined = Array.isArray(timeframeTags)
      ? (timeframeTags as string[]).flatMap((v) => v.split(','))
      : typeof timeframeTags === 'string'
        ? timeframeTags.split(',')
        : undefined;

    const contentTagsArr: string[] | undefined = Array.isArray(contentTags)
      ? (contentTags as string[]).flatMap((v) => v.split(','))
      : typeof contentTags === 'string'
        ? contentTags.split(',')
        : undefined;

    const includeUntaggedBool = includeUntagged === 'true';

    const [tags, allLessons, myLessons, finished] = await Promise.all([
      this.lessonsService.getAvailableTags(),
      this.lessonsService.listLessons(
        lvl,
        levelsArr,
        timeframeTagsArr,
        contentTagsArr,
        includeUntaggedBool,
      ),
      this.lessonsService.listLessonsByCreator(
        req.user.email,
        lvl,
        levelsArr,
        timeframeTagsArr,
        contentTagsArr,
        includeUntaggedBool,
      ),
      this.lessonsService.getFinishedLessonIds(req.user.id),
    ]);

    const mapLesson = (l: any) => ({
      id: l.id,
      title: l.title ?? null,
      level: l.level,
      createdAt: l.createdAt.toISOString(),
      lessonType: l.lessonType,
      titlePinyin: l.titlePinyin,
      titleTranslation: l.titleTranslation,
      tags: l.tags || [],
    });

    return {
      tags,
      all: allLessons.map(mapLesson),
      mine: myLessons.map(mapLesson),
      finishedIds: finished,
    };
  }

  @Post('generate')
  async generateLesson(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateLessonDto,
  ): Promise<{ id: number }> {
    const result = await this.lessonsService.generateAndStoreLesson(
      req.user,
      dto,
    );
    return { id: result.id };
  }

  @Get('tags')
  async getAvailableTags(): Promise<{
    timeframe: Array<{ tag: string; count: number }>;
    content: Array<{ tag: string; count: number }>;
  }> {
    return this.lessonsService.getAvailableTags();
  }

  @Get()
  async listLessons(
    @Query('level') level?: string,
    @Query('levels') levels?: string | string[],
    @Query('timeframeTags') timeframeTags?: string | string[],
    @Query('contentTags') contentTags?: string | string[],
    @Query('includeUntagged') includeUntagged?: string,
  ): Promise<
    Array<{
      id: number;
      title: string | null;
      level: number;
      createdAt: string;
      lessonType: string;
      titlePinyin: string | null;
      titleTranslation: string | null;
      tags: string[];
    }>
  > {
    const lvl = level ? parseInt(level, 10) : undefined;
    const levelsArr: number[] | undefined = Array.isArray(levels)
      ? (levels as string[])
          .flatMap((v) => v.split(','))
          .map((v) => parseInt(v, 10))
          .filter((n) => !isNaN(n))
      : typeof levels === 'string'
        ? levels
            .split(',')
            .map((v) => parseInt(v, 10))
            .filter((n) => !isNaN(n))
        : undefined;

    const timeframeTagsArr: string[] | undefined = Array.isArray(timeframeTags)
      ? (timeframeTags as string[]).flatMap((v) => v.split(','))
      : typeof timeframeTags === 'string'
        ? timeframeTags.split(',')
        : undefined;

    const contentTagsArr: string[] | undefined = Array.isArray(contentTags)
      ? (contentTags as string[]).flatMap((v) => v.split(','))
      : typeof contentTags === 'string'
        ? contentTags.split(',')
        : undefined;

    const includeUntaggedBool = includeUntagged === 'true';

    const lessons = await this.lessonsService.listLessons(
      lvl,
      levelsArr,
      timeframeTagsArr,
      contentTagsArr,
      includeUntaggedBool,
    );
    return lessons.map((l: any) => ({
      id: l.id,
      title: l.title ?? null,
      level: l.level,
      createdAt: l.createdAt.toISOString(),
      lessonType: l.lessonType,
      titlePinyin: l.titlePinyin,
      titleTranslation: l.titleTranslation,
      tags: l.tags || [],
    }));
  }

  // SSE stream moved to `LessonsStreamController` (unauthenticated controller validating token)

  @Get('mine')
  async listMyLessons(
    @Req() req: AuthenticatedRequest,
    @Query('level') level?: string,
    @Query('levels') levels?: string | string[],
    @Query('timeframeTags') timeframeTags?: string | string[],
    @Query('contentTags') contentTags?: string | string[],
    @Query('includeUntagged') includeUntagged?: string,
  ): Promise<
    Array<{
      id: number;
      title: string | null;
      level: number;
      createdAt: string;
      lessonType: string;
      titlePinyin: string | null;
      titleTranslation: string | null;
      tags: string[];
    }>
  > {
    const lvl = level ? parseInt(level, 10) : undefined;
    const levelsArr: number[] | undefined = Array.isArray(levels)
      ? (levels as string[])
          .flatMap((v) => v.split(','))
          .map((v) => parseInt(v, 10))
          .filter((n) => !isNaN(n))
      : typeof levels === 'string'
        ? levels
            .split(',')
            .map((v) => parseInt(v, 10))
            .filter((n) => !isNaN(n))
        : undefined;

    const timeframeTagsArr: string[] | undefined = Array.isArray(timeframeTags)
      ? (timeframeTags as string[]).flatMap((v) => v.split(','))
      : typeof timeframeTags === 'string'
        ? timeframeTags.split(',')
        : undefined;

    const contentTagsArr: string[] | undefined = Array.isArray(contentTags)
      ? (contentTags as string[]).flatMap((v) => v.split(','))
      : typeof contentTags === 'string'
        ? contentTags.split(',')
        : undefined;

    const includeUntaggedBool = includeUntagged === 'true';

    const lessons = await this.lessonsService.listLessonsByCreator(
      req.user.email,
      lvl,
      levelsArr,
      timeframeTagsArr,
      contentTagsArr,
      includeUntaggedBool,
    );
    return lessons.map((l: any) => ({
      id: l.id,
      title: l.title ?? null,
      level: l.level,
      createdAt: l.createdAt.toISOString(),
      lessonType: l.lessonType,
      titlePinyin: l.titlePinyin,
      titleTranslation: l.titleTranslation,
      tags: l.tags || [],
    }));
  }

  @Get(':id')
  async getLessonById(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{
    id: number;
    level: number;
    title: string | null;
    createdAt: string;
    sections: Array<{ id: number; sectionType: string; content: any }>;
    sectionsPreview?: Array<{ id: number; sectionType: string; content: any }>;
    finished?: boolean;
    access: LessonAccess;
    unlockInfo?: LessonUnlockInfo;
  }> {
    const lessonId = parseInt(id, 10);
    if (!Number.isFinite(lessonId)) {
      throw new BadRequestException('Invalid lesson id');
    }

    const userId = req.user.id;
    const lesson = await this.lessonsService.getLessonById(lessonId, userId);
    const isCreator =
      lesson?.createdBy &&
      typeof req.user?.email === 'string' &&
      lesson.createdBy === req.user.email;
    const {
      plan: { code: rawPlanCode },
    } = await this.billingPlanService.getUserPlan(userId);
    const planCode = (String(rawPlanCode || 'FREE').toUpperCase() ||
      'FREE') as PlanCode;
    const isFreePlan = planCode === 'FREE';

    let sections = lesson.sections.map((s) => ({
      id: s.id,
      sectionType: s.sectionType,
      content: s.content,
    }));

    const resource = BILLING_RESOURCES.COMMUNITY_LESSON_FULL_VIEW;
    let access: LessonAccess = 'full';
    let sectionsPreview:
      | Array<{ id: number; sectionType: string; content: any }>
      | undefined;
    let unlockInfo: LessonUnlockInfo;

    const recordAnalytics = async (
      event: 'community_full_view' | 'community_preview_view',
      viewAccess: LessonAccess,
      owned = false,
    ) => {
      if (!isFreePlan) {
        return;
      }
      try {
        await this.usageService.recordAnalytics({
          userId,
          resource,
          amount: 0,
          metadata: {
            lessonId,
            access: viewAccess,
            event,
            planCode,
            owned,
          },
        });
      } catch (err) {
        this.logger.warn('Failed to record community lesson view', err as any);
      }
    };

    if (isCreator) {
      await recordAnalytics('community_full_view', 'full', true);
    } else if (planCode === 'BASIC' || planCode === 'PREMIUM') {
      await recordAnalytics('community_full_view', 'full');
    } else {
      const limit = await this.billingPlanService.getLimit(userId, resource);
      if (!limit || typeof limit.monthlyCap !== 'number') {
        access = 'preview';
        sectionsPreview = this.lessonsService.buildLessonPreview(lesson as any);
        unlockInfo = {
          reason: 'plan_restricted',
          planCode,
          remainingViews: null,
        };
        await recordAnalytics('community_preview_view', 'preview');
      } else if (limit.monthlyCap <= 0) {
        await recordAnalytics('community_full_view', 'full');
      } else {
        const idempotencyKey = `community_view:${userId}:${lessonId}`;
        try {
          await this.usageService.checkAndConsume({
            userId,
            resource,
            amount: 1,
            planCap: limit.monthlyCap,
            idempotencyKey,
          });
          await recordAnalytics('community_full_view', 'full');
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            access = 'preview';
            sections = [];
            sectionsPreview = [];
            unlockInfo = {
              reason: 'community_quota_exceeded',
              planCode,
              remainingViews: 0,
            };
            await recordAnalytics('community_preview_view', 'preview');
          } else {
            throw err;
          }
        }
      }
    }

    return {
      id: lesson.id,
      level: lesson.level,
      title: lesson.title ?? null,
      createdAt: lesson.createdAt.toISOString(),
      sections,
      sectionsPreview,
      finished: (lesson as any).finished,
      access,
      unlockInfo,
    };
  }

  @Post(':id/finish')
  async markFinished(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.lessonsService.markLessonFinished(req.user.id, parseInt(id, 10));
    return { ok: true } as const;
  }

  @Get('progress/count')
  async getFinishedCount(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ finishedCount: number }> {
    const finishedCount = await this.lessonsService.countFinishedLessons(
      req.user.id,
    );
    return { finishedCount };
  }

  @Get('progress/ids')
  async getFinishedIds(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ ids: number[] }> {
    const ids = await this.lessonsService.getFinishedLessonIds(req.user.id);
    return { ids };
  }

  @Get('progress/by-level')
  async getFinishedByLevel(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ byLevel: Record<number, number> }> {
    const byLevel = await this.lessonsService.getFinishedCountsByLevel(
      req.user.id,
    );
    return { byLevel };
  }

  @Get('progress/streak')
  async getStudyStreak(
    @Req() req: AuthenticatedRequest,
    @Query('offsetMinutes') offsetMinutes?: string,
  ): Promise<{ streakDays: number }> {
    const parsed =
      typeof offsetMinutes === 'string' ? parseInt(offsetMinutes, 10) : 0;
    const safeOffset = Number.isFinite(parsed) ? parsed : 0;
    const streakDays = await this.lessonsService.getStudyStreakDays(
      req.user.id,
      safeOffset,
    );
    return { streakDays };
  }

  @Get('progress/streak-status')
  async getStudyStreakStatus(
    @Req() req: AuthenticatedRequest,
    @Query('offsetMinutes') offsetMinutes?: string,
  ): Promise<{
    todayContinued: boolean;
    streakDays: number;
    carryOverDays: number;
    lastActivityLocalDate: string | null;
  }> {
    const parsed =
      typeof offsetMinutes === 'string' ? parseInt(offsetMinutes, 10) : 0;
    const safeOffset = Number.isFinite(parsed) ? parsed : 0;
    return this.lessonsService.getStudyStreakStatus(req.user.id, safeOffset);
  }

  @Get('progress/words-read')
  async getWordsRead(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ readCount: number }> {
    const readCount = await this.lessonsService.getWordsReadCount(req.user.id);
    return { readCount };
  }

  @Get('progress/words-read-by-hsk')
  async getWordsReadByHsk(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ byHsk: Record<string, number> }> {
    const byHsk = await this.lessonsService.getWordsReadByHsk(req.user.id);
    return { byHsk };
  }

  @Get('progress/weekly')
  async getWeeklyProgress(
    @Req() req: AuthenticatedRequest,
    @Query('offsetMinutes') offsetMinutes?: string,
  ): Promise<{
    weeklyCount: number;
    weekStartLocalISO: string;
    weekEndLocalISO: string;
  }> {
    const parsed =
      typeof offsetMinutes === 'string' ? parseInt(offsetMinutes, 10) : 0;
    const safeOffset = Number.isFinite(parsed) ? parsed : 0;
    return this.lessonsService.countWeeklyFinishedLessons(
      req.user.id,
      safeOffset,
    );
  }

  @Get('progress/words-timeline')
  async getWordsTimeline(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('offsetMinutes') offsetMinutes?: string,
  ): Promise<{
    points: Array<{ date: string; new: number; learned: number }>;
    totals: { new: number; learned: number };
  }> {
    const parsed =
      typeof offsetMinutes === 'string' ? parseInt(offsetMinutes, 10) : 0;
    const safeOffset = Number.isFinite(parsed) ? parsed : 0;
    return this.lessonsService.getWordsTimeline(
      req.user.id,
      from,
      to,
      safeOffset,
    );
  }
}
