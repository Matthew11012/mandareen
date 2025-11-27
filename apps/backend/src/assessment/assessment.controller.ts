import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
  Sse,
} from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { FetchQuestionsDto } from './dto/fetch-questions.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { DualAuthGuard } from '../auth/guards/dual-auth.guard';
import { Passage } from './models/passage.model';
import { AuthenticatedRequest } from '../types/request.types';
import { BillingPlanService } from '../billing/billing-plan.service';
import { UsageService } from '../billing/usage.service';
import { RateLimitService } from '../billing/rate-limit.service';
import { BILLING_RESOURCES } from '../billing/billing-resources.constants';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';

@Controller('assess')
@UseGuards(DualAuthGuard)
export class AssessmentController {
  constructor(
    private readonly assessmentService: AssessmentService,
    private readonly billingPlanService: BillingPlanService,
    private readonly usageService: UsageService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Get('questions')
  async getAssessmentQuestions(
    @Req() req: AuthenticatedRequest,
    @Query() queryParams: FetchQuestionsDto,
  ): Promise<Passage[]> {
    const userId = req.user.id;
    const resource = BILLING_RESOURCES.ASSESSMENT_TAKEN;

    // Generate sessionId for idempotency (create if missing)
    const sessionId = randomUUID();
    const idempotencyKey = `assessment:${userId}:${sessionId}`;

    // Resolve limit for assessment
    const limit = await this.billingPlanService.getLimit(userId, resource);
    if (limit) {
      // Rate limit check (RPM) - default to 6/min if unset
      const rpm = limit.rpm && limit.rpm > 0 ? limit.rpm : 6;
      await this.rateLimitService.acquire({
        userId,
        resource,
        rpm,
        burst: limit.burst ?? undefined,
      });

      // Quota check and consume
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

    return this.assessmentService.fetchAssessmentQuestions(userId, queryParams);
  }

  @Sse('questions/stream')
  streamAssessmentQuestions(
    @Req() req: AuthenticatedRequest,
    @Query() queryParams: FetchQuestionsDto,
  ): Observable<{ event: string; data: any } | { data: string }> {
    const userId = req.user.id;
    const resource = BILLING_RESOURCES.ASSESSMENT_TAKEN;

    // Generate sessionId for idempotency (create if missing)
    const sessionId = randomUUID();
    const idempotencyKey = `assessment:${userId}:${sessionId}`;

    // Enforcement: check limits before starting stream
    return new Observable((subscriber) => {
      (async () => {
        try {
          const limit = await this.billingPlanService.getLimit(
            userId,
            resource,
          );
          if (limit) {
            // Rate limit check (RPM) - default to 6/min if unset
            const rpm = limit.rpm && limit.rpm > 0 ? limit.rpm : 6;
            await this.rateLimitService.acquire({
              userId,
              resource,
              rpm,
              burst: limit.burst ?? undefined,
            });

            // Quota check and consume
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
          const streamObservable =
            this.assessmentService.streamAssessmentQuestions(
              userId,
              queryParams,
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

  @Post('submit')
  async submitAssessment(
    @Req() req: AuthenticatedRequest,
    @Body() submitDto: SubmitAssessmentDto,
  ): Promise<{ levelPlaced: number }> {
    return this.assessmentService.submitAssessment(req.user.id, submitDto);
  }

  @Get('history')
  async getAssessmentHistory(@Req() req: AuthenticatedRequest): Promise<any[]> {
    return this.assessmentService.getAssessmentHistory(req.user.id);
  }

  @Get('current-level')
  async getCurrentLevel(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ currentLevel: number | null }> {
    return this.assessmentService.getCurrentLevel(req.user.id);
  }
}
