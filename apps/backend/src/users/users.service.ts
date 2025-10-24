import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(
    userId: number,
  ): Promise<{
    id: number;
    email: string;
    createdAt: Date;
    weeklyGoalLessons: number | null;
  }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        weeklyGoalLessons: true,
      },
    });
    return user;
  }

  async setWeeklyGoal(
    userId: number,
    weeklyGoalLessons: number | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { weeklyGoalLessons },
    });
  }

  async getCurrentLevel(
    userId: number,
  ): Promise<{ currentLevel: number | null }> {
    const latestAssessment = await this.prisma.assessment.findFirst({
      where: { userId },
      orderBy: { takenAt: 'desc' },
      select: { levelPlaced: true },
    });
    return {
      currentLevel: latestAssessment ? latestAssessment.levelPlaced : null,
    };
  }
}
