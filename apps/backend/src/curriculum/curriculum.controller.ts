import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BadRequestException } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { AuthenticatedRequest } from '../types/request.types';
import { Query } from '@nestjs/common';
import { BillingPlanService } from '../billing/billing-plan.service';
import { UsageService } from '../billing/usage.service';
import { RateLimitService } from '../billing/rate-limit.service';
import { BILLING_RESOURCES } from '../billing/billing-resources.constants';

@Controller('curriculum')
@UseGuards(JwtAuthGuard)
export class CurriculumController {
  private readonly logger = new Logger(CurriculumController.name);
  private readonly curriculum: CurriculumService;
  private readonly billingPlanService: BillingPlanService;
  private readonly usageService: UsageService;
  private readonly rateLimitService: RateLimitService;

  constructor(
    curriculum: CurriculumService,
    billingPlanService: BillingPlanService,
    usageService: UsageService,
    rateLimitService: RateLimitService,
  ) {
    this.curriculum = curriculum;
    this.billingPlanService = billingPlanService;
    this.usageService = usageService;
    this.rateLimitService = rateLimitService;
  }

  @Get('units')
  listUnits(
    @Req() req: AuthenticatedRequest,
    @Query('sourceId') sourceIdRaw?: string,
    @Query('source') sourceSlug?: string,
  ) {
    let sourceId = Number(sourceIdRaw);
    // Fallback: if `source` is numeric, treat it as an id
    if (!Number.isFinite(sourceId) && typeof sourceSlug === 'string') {
      const maybeId = Number(sourceSlug);
      if (Number.isFinite(maybeId)) {
        sourceId = maybeId;
        sourceSlug = undefined;
      }
    }
    return this.curriculum.listUnitsWithProgress(req.user.id, {
      sourceId: Number.isFinite(sourceId) ? sourceId : undefined,
      sourceSlug: typeof sourceSlug === 'string' ? sourceSlug : undefined,
    });
  }

  @Get('sources')
  listSources() {
    return this.curriculum.listSources();
  }

  @Get('units/:unitId')
  async getUnit(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
  ) {
    const id = Number(unitId);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid unitId');
    }
    const userId = req.user.id;
    const unit = await this.curriculum.getUnitDetail(userId, id);

    if (unit) {
      try {
        await this.usageService.recordAnalytics({
          userId,
          resource: BILLING_RESOURCES.CURRICULUM_UNIT_FULL_ACCESS,
          amount: 1,
          metadata: {
            unitId: id,
            view: 'unit_detail',
          },
        });
      } catch (err) {
        this.logger.warn('Failed to record curriculum unit view', err as any);
      }
    }

    return unit;
  }

  @Get('units/:unitId/navigation')
  getUnitNavigation(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
    @Query('sourceId') sourceIdRaw?: string,
    @Query('source') sourceSlug?: string,
  ) {
    const id = Number(unitId);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid unitId');
    }
    let sourceId = Number(sourceIdRaw);
    if (!Number.isFinite(sourceId) && typeof sourceSlug === 'string') {
      const maybeId = Number(sourceSlug);
      if (Number.isFinite(maybeId)) {
        sourceId = maybeId;
        sourceSlug = undefined;
      }
    }
    return this.curriculum.getUnitNavigation(req.user.id, id, {
      sourceId: Number.isFinite(sourceId) ? sourceId : undefined,
      sourceSlug: typeof sourceSlug === 'string' ? sourceSlug : undefined,
    });
  }

  @Get('units/:unitId/lessons/:lessonId')
  async getLesson(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
    @Param('lessonId') lessonId: string,
  ) {
    const uid = Number(unitId);
    const lid = Number(lessonId);
    if (!Number.isFinite(uid) || !Number.isFinite(lid)) {
      throw new BadRequestException('Invalid unitId or lessonId');
    }
    const userId = req.user.id;
    const lesson = await this.curriculum.getLessonWithActivities(
      userId,
      uid,
      lid,
    );

    if (lesson) {
      try {
        await this.usageService.recordAnalytics({
          userId,
          resource: BILLING_RESOURCES.CURRICULUM_UNIT_FULL_ACCESS,
          amount: 1,
          metadata: {
            unitId: uid,
            lessonId: lid,
            view: 'lesson_detail',
          },
        });
      } catch (err) {
        this.logger.warn('Failed to record curriculum lesson view', err as any);
      }
    }

    return lesson;
  }

  @Get('units/:unitId/lessons/:lessonId/navigation')
  getLessonNavigation(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
    @Param('lessonId') lessonId: string,
    @Query('sourceId') sourceIdRaw?: string,
    @Query('source') sourceSlug?: string,
  ) {
    const uid = Number(unitId);
    const lid = Number(lessonId);
    if (!Number.isFinite(uid) || !Number.isFinite(lid)) {
      throw new BadRequestException('Invalid unitId or lessonId');
    }
    let sourceId = Number(sourceIdRaw);
    if (!Number.isFinite(sourceId) && typeof sourceSlug === 'string') {
      const maybeId = Number(sourceSlug);
      if (Number.isFinite(maybeId)) {
        sourceId = maybeId;
        sourceSlug = undefined;
      }
    }
    return this.curriculum.getLessonNavigation(req.user.id, uid, lid, {
      sourceId: Number.isFinite(sourceId) ? sourceId : undefined,
      sourceSlug: typeof sourceSlug === 'string' ? sourceSlug : undefined,
    });
  }

  @Post('units/:unitId/lessons/:lessonId/generate')
  async generateLesson(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
    @Param('lessonId') lessonId: string,
    @Body() body: { force?: boolean; levelBand?: number },
  ) {
    const userId = req.user.id;
    const unitIdNum = Number(unitId);
    const lessonIdNum = Number(lessonId);
    const levelBand = typeof body?.levelBand === 'number' ? body.levelBand : 0;
    const resource = BILLING_RESOURCES.CURRICULUM_GENERATED;

    // Resolve limit for curriculum generation
    const limit = await this.billingPlanService.getLimit(userId, resource);
    if (limit) {
      // Rate limit check (RPM)
      if (limit.rpm && limit.rpm > 0) {
        await this.rateLimitService.acquire({
          userId,
          resource,
          rpm: limit.rpm,
          burst: limit.burst ?? undefined,
        });
      }

      // Quota check and consume (idempotency key: curri:userId:unitId:lessonId:levelBand)
      const idempotencyKey = `curri:${userId}:${unitIdNum}:${lessonIdNum}:${levelBand}`;
      if (limit.monthlyCap > 0) {
        await this.usageService.checkAndConsume({
          userId,
          resource,
          amount: 1,
          idempotencyKey,
          planCap: limit.monthlyCap,
        });
      }
    }

    return this.curriculum.generateMissingActivities({
      userId,
      unitId: unitIdNum,
      lessonId: lessonIdNum,
      force: !!body?.force,
      levelBand,
    });
  }

  @Post('activities/:activityId/attempt')
  submitAttempt(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Body() body: { payload: any; score?: number },
  ) {
    return this.curriculum.submitAttempt({
      userId: req.user.id,
      activityId: Number(activityId),
      payload: body?.payload,
      score: typeof body?.score === 'number' ? body.score : undefined,
    });
  }
}
