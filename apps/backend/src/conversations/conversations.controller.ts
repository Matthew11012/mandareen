import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BillingPlanService } from '../billing/billing-plan.service';
import { UsageService } from '../billing/usage.service';
import { RateLimitService } from '../billing/rate-limit.service';
import { ConcurrencyService } from '../billing/concurrency.service';
import { BILLING_RESOURCES } from '../billing/billing-resources.constants';

@Controller('conversations')
export class ConversationsController {
  private readonly _service: ConversationsService;
  private readonly _jwtService: JwtService;
  private readonly billingPlanService: BillingPlanService;
  private readonly usageService: UsageService;
  private readonly rateLimitService: RateLimitService;
  private readonly concurrencyService: ConcurrencyService;

  constructor(
    service: ConversationsService,
    jwtService: JwtService,
    billingPlanService: BillingPlanService,
    usageService: UsageService,
    rateLimitService: RateLimitService,
    concurrencyService: ConcurrencyService,
  ) {
    this._service = service;
    this._jwtService = jwtService;
    this.billingPlanService = billingPlanService;
    this.usageService = usageService;
    this.rateLimitService = rateLimitService;
    this.concurrencyService = concurrencyService;
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async start(@Req() req: AuthenticatedRequest) {
    const convo = await this._service.startConversation(req.user.id);
    return { id: convo.id };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/messages')
  async list(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const messages = await this._service.listMessages(Number(id));
    return messages;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/messages')
  async send(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { hanzi: string },
  ) {
    const userId = req.user.id;
    const resource = BILLING_RESOURCES.CONVO_MESSAGE_TEXT;

    // Resolve limit for text messages
    const limit = await this.billingPlanService.getLimit(userId, resource);
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

      // Create message first to get messageId for idempotency
      const result = await this._service.sendUserMessage({
        conversationId: Number(id),
        userId,
        hanzi: (body.hanzi || '').trim(),
      });

      // Quota check and consume (after message creation for idempotency key)
      const messageId = (result.user as any).id;
      if (limit.monthlyCap > 0) {
        await this.usageService.checkAndConsume({
          userId,
          resource,
          amount: 1,
          idempotencyKey: `msg:${messageId}`,
          planCap: limit.monthlyCap,
        });
      }

      return result;
    }

    // No limit found, proceed without enforcement
    return await this._service.sendUserMessage({
      conversationId: Number(id),
      userId,
      hanzi: (body.hanzi || '').trim(),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/audio')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async sendAudio(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new Error('No audio file uploaded');
    }

    const userId = req.user.id;
    const resource = BILLING_RESOURCES.CONVO_MESSAGE_AUDIO;

    // Resolve limit for audio messages
    const limit = await this.billingPlanService.getLimit(userId, resource);
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

      // Create message after STT (inside service) to get messageId
      const result = await this._service.sendUserAudioMessage({
        conversationId: Number(id),
        userId,
        audioBuffer: file.buffer,
        mimeType: file.mimetype || 'audio/webm',
      });

      // Quota check and consume (after message creation for idempotency key)
      const messageId = (result.user as any).id;
      if (limit.monthlyCap > 0) {
        await this.usageService.checkAndConsume({
          userId,
          resource,
          amount: 1,
          idempotencyKey: `msg:${messageId}`,
          planCap: limit.monthlyCap,
        });
      }

      return result;
    }

    // No limit found, proceed without enforcement
    return await this._service.sendUserAudioMessage({
      conversationId: Number(id),
      userId,
      audioBuffer: file.buffer,
      mimeType: file.mimetype || 'audio/webm',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Sse(':id/stream')
  stream(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Observable<{ data: string } | { event: string; data: any }> {
    // JwtAuthGuard supports Authorization header, query token, or cookie
    const userId = Number((req as any)?.user?.id);
    if (!userId) {
      throw new Error('Unauthorized');
    }
    const hanzi = ((req as any)?.query?.hanzi as string | undefined) || '';
    const resource = BILLING_RESOURCES.CONVO_STREAM;

    // Resolve concurrency limit for streams and acquire lock before streaming
    return new Observable((subscriber) => {
      let lockKey: string | null = null;
      let subscription: any = null;

      (async () => {
        try {
          const limit = await this.billingPlanService.getLimit(
            userId,
            resource,
          );
          if (limit && limit.concurrency && limit.concurrency > 0) {
            // Acquire concurrency lock (120s TTL for SSE streams)
            const lockResult = await this.concurrencyService.acquire({
              userId,
              resource,
              limit: limit.concurrency,
              ttlMs: 120 * 1000, // 120 seconds
              metadata: { conversationId: Number(id) },
            });
            lockKey = lockResult.lockKey;
          }

          // Get the stream observable
          const streamObservable = this._service.streamReply({
            conversationId: Number(id),
            userId,
            hanzi,
          });

          // Subscribe to the stream and forward events
          subscription = streamObservable.subscribe({
            next: (value) => subscriber.next(value),
            error: async (error) => {
              // Release lock on error
              if (lockKey) {
                try {
                  await this.concurrencyService.release(lockKey);
                } catch (releaseError) {
                  // Log but don't throw - lock cleanup is best-effort
                  console.error(
                    'Failed to release concurrency lock on error:',
                    releaseError,
                  );
                }
              }
              subscriber.error(error);
            },
            complete: async () => {
              // Release lock on complete
              if (lockKey) {
                try {
                  await this.concurrencyService.release(lockKey);
                } catch (releaseError) {
                  // Log but don't throw - lock cleanup is best-effort
                  console.error(
                    'Failed to release concurrency lock on complete:',
                    releaseError,
                  );
                }
              }
              subscriber.complete();
            },
          });
        } catch (error) {
          // If lock acquisition failed, error is already thrown by ConcurrencyService
          // Release lock if it was acquired but stream failed to start
          if (lockKey) {
            try {
              await this.concurrencyService.release(lockKey);
            } catch (releaseError) {
              // Log but don't throw - lock cleanup is best-effort
              console.error(
                'Failed to release concurrency lock on error:',
                releaseError,
              );
            }
          }
          subscriber.error(error);
        }
      })();

      // Cleanup function for when subscriber unsubscribes
      return () => {
        if (subscription) {
          subscription.unsubscribe();
        }
        // Release lock on unsubscribe
        if (lockKey) {
          this.concurrencyService.release(lockKey).catch(() => {
            // Ignore release errors on unsubscribe
          });
        }
      };
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listConversations(@Req() req: AuthenticatedRequest) {
    return this._service.listUserConversations(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteConversation(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const deleted = await this._service.deleteUserConversation(
      req.user.id,
      Number(id),
    );
    return { deleted };
  }
}
