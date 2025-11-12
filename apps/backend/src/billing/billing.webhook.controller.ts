import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PolarAdapter } from './polar.adapter';
import { BillingWebhookService } from './billing.webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvalidSignatureError } from './errors/billing.errors';

/**
 * Webhook controller for receiving billing provider webhooks.
 * Handles signature verification, event persistence, and event processing.
 */
@Controller('billing/webhooks')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);
  private readonly provider: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly polarAdapter: PolarAdapter,
    private readonly webhookService: BillingWebhookService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.provider = this.configService.get<string>('BILLING_PROVIDER', 'polar');
    this.webhookSecret =
      this.configService.get<string>('POLAR_WEBHOOK_SECRET') || '';

    if (!this.webhookSecret) {
      this.logger.warn('POLAR_WEBHOOK_SECRET is not set');
    }
  }

  /**
   * Handle Polar webhook events.
   * POST /billing/webhooks/polar
   * @param req Express request (contains rawBody for signature verification)
   * @param res Express response
   * @param headers Request headers (for signature verification)
   * @returns 200 OK if event is processed successfully
   */
  @Post('polar')
  @HttpCode(HttpStatus.OK)
  async handlePolarWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
    @Headers() headers: Record<string, string>,
  ): Promise<void> {
    try {
      // Get raw body for signature verification
      const rawBody = req.rawBody;

      if (!rawBody) {
        this.logger.error(
          'Raw body is not available for signature verification',
        );
        throw new InvalidSignatureError(
          'Raw body is not available. Ensure rawBody: true is set in NestFactory.create()',
        );
      }

      // Extract webhook headers for StandardWebhooks signature verification
      const webhookHeaders = {
        'webhook-signature':
          headers['webhook-signature'] ||
          headers['x-webhook-signature'] ||
          headers['polar-webhook-signature'] ||
          headers['Webhook-Signature'],
        'webhook-id':
          headers['webhook-id'] ||
          headers['x-webhook-id'] ||
          headers['polar-webhook-id'] ||
          headers['Webhook-Id'],
        'webhook-timestamp':
          headers['webhook-timestamp'] ||
          headers['x-webhook-timestamp'] ||
          headers['polar-webhook-timestamp'] ||
          headers['Webhook-Timestamp'],
      };

      if (
        !webhookHeaders['webhook-signature'] ||
        !webhookHeaders['webhook-id'] ||
        !webhookHeaders['webhook-timestamp']
      ) {
        this.logger.error('Missing required webhook headers');
        throw new InvalidSignatureError(
          'Missing required webhook headers (webhook-signature, webhook-id, webhook-timestamp)',
        );
      }

      // Verify signature using StandardWebhooks
      const isValid = this.polarAdapter.verifySignature(
        rawBody,
        webhookHeaders,
      );

      if (!isValid) {
        this.logger.error('Invalid webhook signature');
        throw new InvalidSignatureError('Invalid webhook signature');
      }

      // Parse webhook payload
      const payload = req.body;

      if (!payload) {
        this.logger.error('Webhook payload is missing');
        throw new InvalidSignatureError('Webhook payload is missing');
      }

      // Extract event metadata from payload
      // Polar webhook payload structure may vary, but typically includes:
      // - event_id: Unique event identifier
      // - event_type: Event type (e.g., 'customer.created', 'subscription.active')
      // - data: Event data (customer, subscription, order, etc.)
      const eventId =
        payload.event_id ||
        payload.id ||
        payload.event?.id ||
        headers['webhook-id'] ||
        `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const eventType =
        payload.event_type || payload.type || payload.event?.type || 'unknown';

      // Persist event with status 'pending' (idempotency check)
      let billingEvent;
      try {
        billingEvent = await this.prisma.billingEvent.create({
          data: {
            provider: this.provider,
            eventId,
            type: eventType,
            payload: payload as any,
            status: 'pending',
          },
        });

      } catch (error: any) {
        // Handle unique constraint violation (event already exists)
        if (error.code === 'P2002') {
          billingEvent = await this.prisma.billingEvent.findUnique({
            where: {
              provider_eventId: {
                provider: this.provider,
                eventId,
              },
            },
          });

          if (!billingEvent) {
            this.logger.error(
              `Event ${eventId} unique constraint violation but event not found`,
            );
            throw new Error(
              `Event ${eventId} unique constraint violation but event not found`,
            );
          }

          // If event is already processed, return early (idempotency)
          if (billingEvent.status === 'processed') {
            res.status(HttpStatus.OK).json({
              received: true,
              eventId,
              status: 'already_processed',
            });
            return;
          }

          // If event is failed, return error (idempotency)
          if (billingEvent.status === 'failed') {
            this.logger.warn(`Event ${eventId} previously failed`);
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
              received: true,
              eventId,
              status: 'previously_failed',
            });
            return;
          }
        } else {
          // Other errors
          this.logger.error(
            `Error persisting webhook event: ${error.message}`,
            error.stack,
          );
          throw error;
        }
      }

      // Process event asynchronously (fire and forget)
      // This ensures webhook endpoint returns quickly to Polar
      this.processEventAsync(billingEvent.eventId).catch((error) => {
        this.logger.error(
          `Error processing event ${billingEvent.eventId} asynchronously: ${error.message}`,
          error.stack,
        );
      });

      // Return 200 OK immediately (before processing completes)
      res.status(HttpStatus.OK).json({
        received: true,
        eventId: billingEvent.eventId,
        status: 'pending',
      });
    } catch (error: any) {
      this.logger.error(
        `Error handling Polar webhook: ${error.message}`,
        error.stack,
      );

      // Return error response
      if (error instanceof InvalidSignatureError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Invalid signature',
          message: error.message,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Internal server error',
          message: error.message,
        });
      }
    }
  }

  /**
   * Process webhook event asynchronously.
   * @param eventId Event ID to process
   */
  private async processEventAsync(eventId: string): Promise<void> {
    try {
      await this.webhookService.process(eventId);
    } catch (error: any) {
      this.logger.error(
        `Error processing event ${eventId}: ${error.message}`,
        error.stack,
      );
      // Error is already logged and event status is updated in webhookService.process()
      throw error;
    }
  }
}
