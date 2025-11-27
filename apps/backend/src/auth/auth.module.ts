import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleStrategy } from './strategies/google.strategy';
import { BetterAuthAdapter } from './better-auth.config';
import { auth } from './lib/auth';
import { UserMigrationService } from './user-migration.service';

@Module({
  imports: [
    PassportModule,
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' }, // Token expires in 1 day
    }),
    BetterAuthModule.forRoot(auth),
  ],
  providers: [
    AuthService,
    GoogleStrategy,
    BetterAuthAdapter,
    UserMigrationService,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
