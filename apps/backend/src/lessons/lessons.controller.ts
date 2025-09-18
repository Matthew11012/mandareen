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
  async getLessonById(@Param('id') id: string): Promise<{
    id: number;
    level: number;
    title: string | null;
    createdAt: string;
    sections: Array<{ id: number; sectionType: string; content: any }>;
  }> {
    const lesson = await this.lessonsService.getLessonById(parseInt(id, 10));
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
    };
  }
}
