import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(
    userId: number,
  ): Promise<{ id: number; email: string; createdAt: Date }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });
    return user;
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
