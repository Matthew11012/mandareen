import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type LessonReadyPayload = {
  id: number;
  title?: string | null;
  topic?: string | null;
  type?: 'story' | 'dialogue';
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertSubscription(userId: number, params: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  }) {
    const { endpoint, p256dh, auth, userAgent } = params;
    await (this.prisma as any).pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh, auth, userAgent: userAgent ?? null, isActive: true, lastSeenAt: new Date() },
      create: { userId, endpoint, p256dh, auth, userAgent: userAgent ?? null, isActive: true },
    });
    return { ok: true } as const;
  }

  async removeSubscription(userId: number, endpoint: string) {
    try {
      await (this.prisma as any).pushSubscription.update({
        where: { endpoint },
        data: { isActive: false },
      });
    } catch {
      // ignore if not found
    }
    return { ok: true } as const;
  }

  async notifyLessonReady(userId: number, payload: LessonReadyPayload) {
    // Soft guard: if env not configured or library not available, no-op
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      this.logger.debug('VAPID keys not configured; skipping web push');
      return { ok: false, reason: 'vapid_not_configured' } as const;
    }

    let webpush: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      webpush = require('web-push');
    } catch (err) {
      this.logger.warn(`web-push not installed; skipping push (${String(err)})`);
      return { ok: false, reason: 'webpush_not_installed' } as const;
    }

    webpush.setVapidDetails(
      'mailto:admin@example.com',
      publicKey,
      privateKey,
    );

    const subs: Array<{ endpoint: string; p256dh: string; auth: string }>
      = await (this.prisma as any).pushSubscription.findMany({
        where: { userId, isActive: true },
        select: { endpoint: true, p256dh: true, auth: true },
      });

    const notificationPayload = {
      title: payload.title?.trim() || payload.topic?.trim() || 'Your lesson',
      body:
        (payload.type === 'dialogue'
          ? 'Dialogue lesson is ready.'
          : 'Story lesson is ready.') + ' Tap to open.',
      data: { id: payload.id, type: payload.type || 'story' },
      tag: `lesson-${payload.id}`,
      renotify: false,
    } as const;

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            JSON.stringify(notificationPayload),
          );
        } catch (err) {
          const msg = String(err?.body || err?.message || err);
          // 410 Gone or 404 Not Found → deactivate
          if (msg.includes('410') || msg.includes('404')) {
            try {
              await (this.prisma as any).pushSubscription.update({
                where: { endpoint: s.endpoint },
                data: { isActive: false },
              });
            } catch {}
          } else {
            this.logger.debug(`Push send failed: ${msg}`);
          }
        }
      }),
    );

    return { ok: true } as const;
  }
}


