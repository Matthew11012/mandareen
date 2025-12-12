import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { VerificationEmail } from './templates/verification-email';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not configured; email sending disabled');
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
    }

    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'noreply@mandareen.com';
  }

  async sendVerificationEmail(
    to: string,
    verificationUrl: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `Email sending disabled; would send verification to ${to}`,
      );
      return;
    }

    const emailComponent = VerificationEmail({
      verificationUrl,
      userEmail: to,
    });
    const text = this.buildPlainText(verificationUrl);

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: 'Verify your email address - Mandareen',
        react: emailComponent,
        text,
      });
      this.logger.log(`Verification email sent to ${to}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to send verification email to ${to}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  private buildPlainText(verificationUrl: string): string {
    return `Verify your email address

Thanks for signing up for Mandareen! Please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 1 hour for security reasons.

If you did not create an account with Mandareen, you can safely ignore this email.`;
  }
}

