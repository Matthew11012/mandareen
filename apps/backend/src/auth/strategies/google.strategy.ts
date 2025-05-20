import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile, StrategyOptions } from 'passport-google-oauth20';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    } as StrategyOptions);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException('Email not provided by Google');
    }
    
    const user = await this.authService.validateGoogleUser({
      email,
      googleId: profile.id,
    });
    done(null, user);
  }
} 