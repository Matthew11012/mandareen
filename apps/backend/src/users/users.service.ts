import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateUsername } from './username.utils';

@Injectable()
export class UsersService {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: number): Promise<{
    id: number;
    email: string;
    username: string;
    createdAt: Date;
    weeklyGoalLessons: number | null;
  }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        weeklyGoalLessons: true,
      },
    });
    return user;
  }

  async updateUsername(
    userId: number,
    newUsername: string,
  ): Promise<{ username: string }> {
    const trimmed = newUsername.trim();

    const validationError = validateUsername(trimmed);
    if (validationError) {
      throw new BadRequestException(validationError);
    }

    const existing = await this.prisma.user.findUnique({
      where: { username: trimmed },
      select: { id: true },
    });

    if (existing && existing.id !== userId) {
      throw new ConflictException('Username already taken');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { username: trimmed },
      select: { username: true },
    });

    return updated;
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
