import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LessonsService } from './lessons.service';
import { AuthenticatedRequest } from '../types/request.types';

export interface GenerateLessonDto {
  level?: number;
  type?: 'story' | 'dialogue';
  readTimeMinutes?: number; // approximate target read time
  topic?: string;
}

@Controller('lessons')
@UseGuards(JwtAuthGuard)
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {
    void this.lessonsService;
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

  @Get()
  async listLessons(
    @Query('level') level?: string,
    @Query('levels') levels?: string | string[],
  ): Promise<
    Array<{
      id: number;
      title: string | null;
      level: number;
      createdAt: string;
      lessonType: string;
      titlePinyin: string | null;
      titleTranslation: string | null;
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
    const lessons = await this.lessonsService.listLessons(lvl, levelsArr);
    return lessons.map((l: any) => ({
      id: l.id,
      title: l.title ?? null,
      level: l.level,
      createdAt: l.createdAt.toISOString(),
      lessonType: l.lessonType,
      titlePinyin: l.titlePinyin,
      titleTranslation: l.titleTranslation,
    }));
  }

  // SSE stream moved to `LessonsStreamController` (unauthenticated controller validating token)

  @Get('mine')
  async listMyLessons(
    @Req() req: AuthenticatedRequest,
    @Query('level') level?: string,
    @Query('levels') levels?: string | string[],
  ): Promise<
    Array<{
      id: number;
      title: string | null;
      level: number;
      createdAt: string;
      lessonType: string;
      titlePinyin: string | null;
      titleTranslation: string | null;
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
    const lessons = await this.lessonsService.listLessonsByCreator(
      req.user.email,
      lvl,
      levelsArr,
    );
    return lessons.map((l: any) => ({
      id: l.id,
      title: l.title ?? null,
      level: l.level,
      createdAt: l.createdAt.toISOString(),
      lessonType: l.lessonType,
      titlePinyin: l.titlePinyin,
      titleTranslation: l.titleTranslation,
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
    finished?: boolean;
  }> {
    const lesson = await this.lessonsService.getLessonById(
      parseInt(id, 10),
      req.user?.id,
    );
    return {
      id: lesson.id,
      level: lesson.level,
      title: lesson.title ?? null,
      createdAt: lesson.createdAt.toISOString(),
      sections: lesson.sections.map((s) => ({
        id: s.id,
        sectionType: s.sectionType,
        content: s.content,
      })),
      finished: (lesson as any).finished,
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

  @Get('progress/words')
  async getWordsLearned(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ learnedCount: number }> {
    const learnedCount = await this.lessonsService.getWordsLearnedCount(
      req.user.id,
    );
    return { learnedCount };
  }
}
