import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleStrategy } from './strategies/google.strategy';
import { createAuthConfig } from './lib/auth';
import { UserMigrationService } from './user-migration.service';
import { EmailModule } from '../email/email.module';
import { EmailService } from '../email/email.service';

@Global()
@Module({
  imports: [
    PassportModule,
    PrismaModule,
    EmailModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' }, // Token expires in 1 day
    }),
    BetterAuthModule.forRootAsync({
      imports: [EmailModule],
      inject: [EmailService],
      useFactory: (emailService: EmailService) => ({
        auth: createAuthConfig(emailService),
      }),
    }),
  ],
  providers: [AuthService, GoogleStrategy, UserMigrationService],
  controllers: [AuthController],
  exports: [AuthService, UserMigrationService],
})
export class AuthModule {}
