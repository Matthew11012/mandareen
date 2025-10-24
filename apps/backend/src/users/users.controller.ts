import {
  Controller,
  Get,
  Put,
  UseGuards,
  Req,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { UsersService } from '../users/users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest): Promise<
    {
      id: number;
      email: string;
      createdAt: string;
      weeklyGoalLessons: number | null;
    } & {
      currentLevel: number | null;
    }
  > {
    const user = await this.usersService.getMe(req.user.id);
    const current = await this.usersService.getCurrentLevel(req.user.id);
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      weeklyGoalLessons: user.weeklyGoalLessons,
      currentLevel: current.currentLevel,
    };
  }

  @Put('weekly-goal')
  async setWeeklyGoal(
    @Req() req: AuthenticatedRequest,
    @Body() body: { weeklyGoalLessons: number | null },
  ): Promise<{ weeklyGoalLessons: number | null }> {
    const { weeklyGoalLessons } = body;

    // Validate range when not null
    if (
      weeklyGoalLessons !== null &&
      (weeklyGoalLessons < 1 || weeklyGoalLessons > 50)
    ) {
      throw new BadRequestException(
        'Weekly goal must be between 1 and 50 lessons, or null to unset',
      );
    }

    await this.usersService.setWeeklyGoal(req.user.id, weeklyGoalLessons);
    return { weeklyGoalLessons };
  }
}
