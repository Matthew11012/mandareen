import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { LessonsService } from '../lessons/lessons.service';
import { CurriculumService } from '../curriculum/curriculum.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    private readonly lessonsService: LessonsService,
    private readonly curriculumService: CurriculumService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('overview')
  async getOverview(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const [
      assessmentHistory,
      lessonsCount,
      streakStatus,
      wordsRead,
      units,
      currentLevel,
      weeklyProgress,
      me,
      flashcardsSummary,
    ] = await Promise.all([
      this.prisma.assessment.findMany({
        where: { userId },
        orderBy: { takenAt: 'desc' },
        select: { id: true, levelPlaced: true, takenAt: true },
      }),
      this.lessonsService.countFinishedLessons(userId),
      this.lessonsService.getStudyStreakStatus(userId, 0).catch(() => null),
      this.lessonsService.getWordsReadCount(userId).catch(() => 0),
      this.curriculumService.listUnitsWithProgress(userId),
      this.prisma.assessment
        .findFirst({
          where: { userId },
          orderBy: { takenAt: 'desc' },
          select: { levelPlaced: true },
        })
        .then((a) => ({ currentLevel: a?.levelPlaced ?? null })),
      this.lessonsService.countWeeklyFinishedLessons(userId, 0).catch(() => ({
        weeklyCount: 0,
        weekStartLocalISO: new Date().toISOString(),
        weekEndLocalISO: new Date().toISOString(),
      })),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          createdAt: true,
          weeklyGoalLessons: true,
        },
      }),
      this.prisma.flashcard.count({ where: { userId } }),
    ]);

    const flashcardsDue = await this.prisma.flashcard.count({
      where: { userId, nextReview: { lte: new Date() } },
    });

    return {
      assessmentHistory,
      lessonsCount: { finishedCount: lessonsCount },
      streakStatus:
        streakStatus ??
        ({
          todayContinued: true,
          streakDays: 0,
          carryOverDays: 0,
          lastActivityLocalDate: null,
        } as const),
      wordsRead: { readCount: wordsRead },
      units,
      currentLevel,
      weeklyProgress,
      me: me ?? {
        id: userId,
        email: userEmail,
        username: userEmail?.split('@')[0] ?? 'Learner',
        createdAt: new Date().toISOString(),
        currentLevel: null,
        weeklyGoalLessons: null,
      },
      flashcardsSummary: {
        total: flashcardsSummary ?? 0,
        due: flashcardsDue,
      },
    };
  }
}
