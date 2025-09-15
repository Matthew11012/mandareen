import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { UsersService } from '../users/users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest): Promise<
    { id: number; email: string; createdAt: string } & {
      currentLevel: number | null;
    }
  > {
    const user = await this.usersService.getMe(req.user.id);
    const current = await this.usersService.getCurrentLevel(req.user.id);
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      currentLevel: current.currentLevel,
    };
  }
}
