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
import { AuthGuard } from '../auth/guards/auth.guard';
import { BadRequestException } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { AuthenticatedRequest } from '../types/request.types';
import { Query } from '@nestjs/common';
import { BillingPlanService } from '../billing/billing-plan.service';
import { UsageService } from '../billing/usage.service';
import { RateLimitService } from '../billing/rate-limit.service';
import { BILLING_RESOURCES } from '../billing/billing-resources.constants';
import { isFreeSampleUnit } from './curriculum.config';

@Controller('curriculum')
@UseGuards(AuthGuard)
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
  async listUnits(
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
    const userId = req.user.id;
    const units = await this.curriculum.listUnitsWithProgress(userId, {
      sourceId: Number.isFinite(sourceId) ? sourceId : undefined,
      sourceSlug: typeof sourceSlug === 'string' ? sourceSlug : undefined,
    });

    const {
      plan: { code: rawPlanCode },
    } = await this.billingPlanService.getUserPlan(userId);
    const planCode = (String(rawPlanCode || 'FREE').toUpperCase() || 'FREE') as
      | 'FREE'
      | 'BASIC'
      | 'PREMIUM';

    return units.map((unit) => {
      const isFreeSample = isFreeSampleUnit(unit.id, (unit as any).order);
      const access =
        planCode === 'FREE' && !isFreeSample ? ('preview' as const) : 'full';
      return {
        ...unit,
        access,
        isFreeSample,
      };
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
    if (!unit) {
      return null;
    }

    const {
      plan: { code: rawPlanCode },
    } = await this.billingPlanService.getUserPlan(userId);
    const planCode = (String(rawPlanCode || 'FREE').toUpperCase() || 'FREE') as
      | 'FREE'
      | 'BASIC'
      | 'PREMIUM';
    const isFreePlan = planCode === 'FREE';
    const unitOrder = (unit as any).order ?? null;
    const isFreeSample = isFreeSampleUnit(id, unitOrder);
    const access =
      planCode === 'FREE' && !isFreeSample ? ('preview' as const) : 'full';

    const lessons =
      Array.isArray((unit as any).lessons) && (unit as any).lessons.length > 0
        ? (unit as any).lessons.map((lesson: any) => ({
            ...lesson,
            access: typeof lesson.access === 'string' ? lesson.access : access,
            isFreeSample,
          }))
        : (unit as any).lessons;

    if (isFreePlan) {
      try {
        await this.usageService.recordAnalytics({
          userId,
          resource: BILLING_RESOURCES.CURRICULUM_UNIT_FULL_ACCESS,
          amount: 0,
          metadata: {
            unitId: id,
            view: 'unit_detail',
            access,
            planCode,
          },
        });
      } catch (err) {
        this.logger.warn('Failed to record curriculum unit view', err as any);
      }
    }

    return {
      ...unit,
      lessons,
      access,
      isFreeSample,
    };
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

    if (!lesson) {
      return null;
    }

    const {
      plan: { code: rawPlanCode },
    } = await this.billingPlanService.getUserPlan(userId);
    const planCode = (String(rawPlanCode || 'FREE').toUpperCase() || 'FREE') as
      | 'FREE'
      | 'BASIC'
      | 'PREMIUM';
    const isFreePlan = planCode === 'FREE';
    const unitOrder = (lesson as any)?.unit?.order ?? null;
    const isFreeSample = isFreeSampleUnit(uid, unitOrder);

    let access: 'full' | 'preview' = 'full';
    let unlockInfo:
      | {
          reason: 'curriculum_quota_exceeded' | 'plan_restricted';
          planCode: 'FREE' | 'BASIC' | 'PREMIUM';
        }
      | undefined;

    if (planCode === 'FREE' && !isFreeSample) {
      access = 'preview';
      unlockInfo = {
        reason: 'plan_restricted',
        planCode,
      };
    }

    const activities =
      access === 'full' && Array.isArray((lesson as any).activities)
        ? (lesson as any).activities
        : [];

    // Only log curriculum_unit_full_access for FREE plan users
    // Paid users (BASIC/PREMIUM) don't need this logged as it's always 0
    if (isFreePlan) {
      try {
        await this.usageService.recordAnalytics({
          userId,
          resource: BILLING_RESOURCES.CURRICULUM_UNIT_FULL_ACCESS,
          amount: 0,
          metadata: {
            unitId: uid,
            lessonId: lid,
            view: 'lesson_detail',
            access,
            planCode,
          },
        });
      } catch (err) {
        this.logger.warn('Failed to record curriculum lesson view', err as any);
      }
    }
    // Explicitly skip logging for paid plans (BASIC/PREMIUM)

    const lessonRest = { ...(lesson as any) };
    delete (lessonRest as any).unit;

    return {
      ...lessonRest,
      activities,
      access,
      isFreeSample,
      unlockInfo,
    };
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
