import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

class SubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

class SubscribeDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @ValidateNested()
  @Type(() => SubscriptionKeysDto)
  keys!: SubscriptionKeysDto;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('subscribe')
  async subscribe(@Req() req: any, @Body() body: SubscribeDto) {
    const userId: number = req.user.id;
    const { endpoint, keys, userAgent } = body || ({} as any);
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Invalid subscription');
    }
    await this.notifications.upsertSubscription(userId, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? req.headers['user-agent'],
    });
    return { ok: true } as const;
  }

  @Delete('subscribe')
  async unsubscribe(@Req() req: any, @Body() body: { endpoint: string }) {
    const userId: number = req.user.id;
    if (!body?.endpoint) throw new Error('Missing endpoint');
    await this.notifications.removeSubscription(userId, body.endpoint);
    return { ok: true } as const;
  }
}


