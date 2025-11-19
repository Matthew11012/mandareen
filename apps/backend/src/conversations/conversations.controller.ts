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
  BadRequestException,
  NotFoundException,
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

    // Apply RPM rate limiting if configured, but do not log usage events
    const limit = await this.billingPlanService.getLimit(userId, resource);
    if (limit?.rpm && limit.rpm > 0) {
      await this.rateLimitService.acquire({
        userId,
        resource,
        rpm: limit.rpm,
        burst: limit.burst ?? undefined,
      });
    }

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

    // Rate limit check (RPM) for audio message count
    const limit = await this.billingPlanService.getLimit(userId, resource);
    if (limit && limit.rpm && limit.rpm > 0) {
      await this.rateLimitService.acquire({
        userId,
        resource,
        rpm: limit.rpm,
        burst: limit.burst ?? undefined,
      });
    }

    // Check if audio duration quota is already over 100% (reject if so)
    const audioDurationResource = BILLING_RESOURCES.CONVO_TTS_SECONDS;
    const audioDurationLimit = await this.billingPlanService.getLimit(
      userId,
      audioDurationResource,
    );
    if (audioDurationLimit && audioDurationLimit.monthlyCap > 0) {
      const currentUsage = await this.usageService.sumUsedLastNDays(
        userId,
        audioDurationResource,
      );
      if (currentUsage >= audioDurationLimit.monthlyCap) {
        const quotaPercentage =
          (currentUsage / audioDurationLimit.monthlyCap) * 100;
        throw new BadRequestException(
          `Audio quota exceeded (${quotaPercentage.toFixed(1)}%). Your audio input quota has been reached. Please upgrade your plan to continue using audio features.`,
        );
      }
    }

    // Service handles audio duration quota (CONVO_TTS_SECONDS) and message count quota
    // Audio duration is recorded after successful transcription (allows going slightly over)
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

  @UseGuards(JwtAuthGuard)
  @Post(':conversationId/messages/:messageId/generate-notes')
  async generateManualNotes(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    const userId = req.user.id;
    const convId = Number(conversationId);
    const msgId = Number(messageId);

    if (!Number.isFinite(convId) || !Number.isFinite(msgId)) {
      throw new BadRequestException('Invalid conversationId or messageId');
    }

    // 1) Verify conversation/message ownership and get message content
    const message = await this._service['prisma'].message.findFirst({
      where: {
        id: msgId,
        conversation: { id: convId, userId },
        role: 'ai', // Only AI messages can have notes generated
      },
      select: { id: true, hanzi: true, conversationId: true },
    });
    if (!message) {
      throw new NotFoundException('AI message not found');
    }

    if (!message.hanzi || message.hanzi.trim().length === 0) {
      throw new BadRequestException(
        'Message has no content to generate notes from',
      );
    }

    // Get the most recent user message for context
    const userMessage = await this._service['prisma'].message.findFirst({
      where: {
        conversationId: convId,
        role: 'user',
      },
      orderBy: { createdAt: 'desc' },
      select: { hanzi: true },
    });
    const userHanzi = userMessage?.hanzi || '';

    // 2) Check quota (but don't consume yet - only consume on success)
    const resource = BILLING_RESOURCES.CONVO_MANUAL_NOTES;
    const limit = await this.billingPlanService.getLimit(userId, resource);
    const idempotencyKey = `manualnotes:${userId}:${msgId}`;

    if (limit && limit.monthlyCap > 0) {
      // Check quota without consuming (will throw if exceeded)
      await this.usageService.ensureWithinQuota({
        userId,
        resource,
        amount: 1,
        planCap: limit.monthlyCap,
        idempotencyKey,
      });
    }

    // 3) Generate notes using the same method as automatic generation
    // Only consume quota after successful generation and saving
    const enrichedNotes = await this._service.generateEnrichedNotes(
      userId,
      message.hanzi,
      userHanzi,
      convId,
      msgId,
    );

    // 4) Consume quota only after successful generation and database save
    // If generation failed, this line won't execute and quota won't be consumed
    if (limit && limit.monthlyCap > 0) {
      await this.usageService.recordUsage({
        userId,
        resource,
        amount: 1,
        idempotencyKey,
      });
    }

    return {
      ok: true,
      notes: enrichedNotes,
    };
  }
}
