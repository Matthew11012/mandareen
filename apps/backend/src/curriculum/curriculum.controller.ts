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
import { CurriculumService } from './curriculum.service';
import { AuthenticatedRequest } from '../types/request.types';

@Controller('curriculum')
@UseGuards(JwtAuthGuard)
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get('units')
  listUnits(@Req() req: AuthenticatedRequest) {
    return this.curriculum.listUnitsWithProgress(req.user.id);
  }

  @Get('units/:unitId')
  getUnit(@Req() req: AuthenticatedRequest, @Param('unitId') unitId: string) {
    return this.curriculum.getUnitDetail(req.user.id, Number(unitId));
  }

  @Get('units/:unitId/lessons/:lessonId')
  getLesson(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.curriculum.getLessonWithActivities(
      req.user.id,
      Number(unitId),
      Number(lessonId),
    );
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
