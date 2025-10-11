import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BadRequestException } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { AuthenticatedRequest } from '../types/request.types';
import { Query } from '@nestjs/common';

@Controller('curriculum')
@UseGuards(JwtAuthGuard)
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

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
  getUnit(@Req() req: AuthenticatedRequest, @Param('unitId') unitId: string) {
    const id = Number(unitId);
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid unitId');
    }
    return this.curriculum.getUnitDetail(req.user.id, id);
  }

  @Get('units/:unitId/lessons/:lessonId')
  getLesson(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
    @Param('lessonId') lessonId: string,
  ) {
    const uid = Number(unitId);
    const lid = Number(lessonId);
    if (!Number.isFinite(uid) || !Number.isFinite(lid)) {
      throw new BadRequestException('Invalid unitId or lessonId');
    }
    return this.curriculum.getLessonWithActivities(req.user.id, uid, lid);
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
  generateLesson(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
    @Param('lessonId') lessonId: string,
    @Body() body: { force?: boolean; levelBand?: number },
  ) {
    return this.curriculum.generateMissingActivities({
      userId: req.user.id,
      unitId: Number(unitId),
      lessonId: Number(lessonId),
      force: !!body?.force,
      levelBand: typeof body?.levelBand === 'number' ? body.levelBand : 0,
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
