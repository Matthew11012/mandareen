import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthGuard } from './guards/auth.guard';
import { Response } from 'express';
import { AuthenticatedRequest } from '../types/request.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Res() res: Response) {
    const result = await this.authService.register(registerDto);
    return res.status(HttpStatus.CREATED).json({ user: result.user });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(loginDto);
    return res.status(HttpStatus.OK).json({ user: result.user });
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    await this.authService.logout();
    // Clear HttpOnly auth cookie
    res.clearCookie('auth-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    return res.status(HttpStatus.OK).json({ message: 'Logged out' });
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // This will redirect to Google login page
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    try {
      await this.authService.googleLogin({
        ...req.user,
        levelPlaced: req.user.levelPlaced ?? null,
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      res.redirect(`${frontendUrl}/dashboard`);
    } catch {
      // Handle error appropriately
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      res.redirect(`${frontendUrl}/auth/error`);
    }
  }
}
