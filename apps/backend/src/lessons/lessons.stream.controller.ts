import { Controller, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { BillingPlanService } from '../billing/billing-plan.service';
import { UsageService } from '../billing/usage.service';
import { RateLimitService } from '../billing/rate-limit.service';
import { BILLING_RESOURCES } from '../billing/billing-resources.constants';
import { Observable } from 'rxjs';

@Controller('lessons')
export class LessonsStreamController {
  constructor(
    private readonly lessonsService: LessonsService,
    private readonly billingPlanService: BillingPlanService,
    private readonly usageService: UsageService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  // Public SSE endpoint; token is validated inside LessonsService
  @UseGuards(JwtAuthGuard)
  @Sse('generate/stream')
  streamGenerate(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: 'story' | 'dialogue',
    @Query('level') level?: string,
    @Query('readTimeMinutes') readTimeMinutes?: string,
    @Query('topic') topic?: string,
    @Query('requestId') requestId?: string,
    @Query('timeframe')
    timeframe?: 'modern' | 'mythic' | 'imperial' | 'pre_modern' | 'futuristic',
  ): Observable<{ event: string; data: any } | { data: string }> {
    const userId = req.user.id;
    const resource = BILLING_RESOURCES.LESSON_CUSTOM_GENERATED;

    // Generate idempotency key from requestId or generate UUID
    const idempotencyKey = requestId
      ? `gen:${requestId}`
      : `gen:${Date.now()}-${Math.random()}`;

    // Prefer using the cookie-based auth; JwtAuthGuard has already validated the token
    // We still extract the cookie value to reuse the existing service method
    const cookieHeader: string | undefined = req?.headers?.cookie;
    let token: string | undefined = req?.cookies?.['auth-token'];
    if (!token && cookieHeader) {
      try {
        const map = Object.fromEntries(
          cookieHeader.split(';').map((c: string) => {
            const idx = c.indexOf('=');
            const name = c.slice(0, idx).trim();
            const val = decodeURIComponent(c.slice(idx + 1));
            return [name, val];
          }),
        );
        token = map['auth-token'];
      } catch {
        token = undefined;
      }
    }
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Enforcement: check limits before starting stream
    return new Observable((subscriber) => {
      (async () => {
        try {
          const limit = await this.billingPlanService.getLimit(
            userId,
            resource,
          );
          if (limit) {
            // Rate limit check (RPM)
            if (limit.rpm && limit.rpm > 0) {
              await this.rateLimitService.acquire({
                userId,
                resource,
                rpm: limit.rpm,
                burst: limit.burst ?? undefined,
              });
            }

            // Quota check and consume (before stream starts)
            if (limit.monthlyCap > 0) {
              await this.usageService.checkAndConsume({
                userId,
                resource,
                amount: 1,
                idempotencyKey,
                planCap: limit.monthlyCap,
              });
            }
          }

          // Start the stream
          const streamObservable = this.lessonsService.streamGenerateWithToken(
            token!,
            {
              type: (type as any) || 'dialogue',
              level: level ? parseInt(level, 10) : undefined,
              readTimeMinutes: readTimeMinutes
                ? parseInt(readTimeMinutes, 10)
                : undefined,
              topic,
              requestId,
              timeframe,
            },
          );

          // Subscribe and forward events
          const subscription = streamObservable.subscribe({
            next: (value) => subscriber.next(value),
            error: (error) => subscriber.error(error),
            complete: () => subscriber.complete(),
          });

          // Cleanup on unsubscribe
          return () => {
            subscription.unsubscribe();
          };
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }
}
