import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthGuard } from './guards/auth.guard';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/request.types';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';

@Controller('auth')
export class AuthController {
  private readonly authService: AuthService;
  private readonly betterAuthService: BetterAuthService;

  constructor(authService: AuthService, betterAuthService: BetterAuthService) {
    this.authService = authService;
    this.betterAuthService = betterAuthService;
  }

  @Get('ping')
  ping() {
    return { ok: true };
  }

  // Controller-level ping to confirm controller routing works in production
  @Get('ctrl-ping')
  ctrlPing() {
    return { ok: true, source: 'controller' };
  }

  // Expose Better Auth session endpoints explicitly to avoid mounting issues in some deployments.
  @Get('session')
  async session(@Req() req: Request) {
    try {
      return await this.betterAuthService.api.getSession({
        headers: req.headers,
      });
    } catch {
      // If no session, return null instead of 404 to avoid proxy masking
      return null;
    }
  }

  // Legacy/RPC-style endpoint used by some clients
  @Get('get-session')
  async getSession(@Req() req: Request) {
    try {
      return await this.betterAuthService.api.getSession({
        headers: req.headers,
      });
    } catch {
      return null;
    }
  }

  @Post('sign-in/email')
  async signInEmail(@Req() req: Request, @Body() body: any) {
    return this.betterAuthService.api.signInEmail({
      headers: req.headers,
      body,
    });
  }

  @Post('sign-in/social')
  async signInSocial(@Req() req: Request, @Body() body: any) {
    return this.betterAuthService.api.signInSocial({
      headers: req.headers,
      body,
    });
  }

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

  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  async sendVerificationEmail(@Req() req: Request, @Body() body: any) {
    const verificationEnabled =
      process.env.EMAIL_VERIFICATION_ENABLED !== 'false';
    if (!verificationEnabled) {
      return { message: 'Verification disabled' };
    }

    const email =
      (body?.email as string | undefined) ??
      (await this.betterAuthService.api
        .getSession({ headers: req.headers })
        .then((s) => s?.user?.email)
        .catch(() => undefined));

    if (!email) {
      throw new UnauthorizedException(
        'Email is required to resend verification',
      );
    }

    const frontendUrl =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_FRONTEND_URL ||
      'http://localhost:3001';

    const params = new URLSearchParams({ mode: 'verify-email', email });
    if (body?.redirect) params.set('redirect', body.redirect);
    if (body?.plan) params.set('plan', body.plan);
    if (body?.billingPeriod) params.set('billingPeriod', body.billingPeriod);

    const callbackURL = `${frontendUrl}/auth/callback?${params.toString()}`;

    await this.betterAuthService.api.sendVerificationEmail({
      body: { email, callbackURL },
      headers: req.headers,
    });

    return { message: 'Verification email sent' };
  }
}
