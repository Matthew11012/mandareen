import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { DualAuthGuard } from '../auth/guards/dual-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { CreateCheckoutDto, BillingPeriod } from './dto/create-checkout.dto';

/**
 * Billing controller for checkout and portal endpoints.
 * Provides endpoints for creating checkout sessions and accessing billing portal.
 */
@Controller('billing')
@UseGuards(DualAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Create a checkout session for a plan.
   * POST /api/billing/checkout
   *
   * @param req Authenticated request with user information
   * @param createCheckoutDto Checkout creation DTO with planCode and optional billingPeriod
   * @returns Checkout URL
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async createCheckout(
    @Req() req: AuthenticatedRequest,
    @Body() createCheckoutDto: CreateCheckoutDto,
  ): Promise<{ url: string }> {
    const userId = req.user.id;
    const { planCode, billingPeriod } = createCheckoutDto;

    // Use billingPeriod from DTO or default to 'monthly'
    // The service will validate the plan code and billing period
    const selectedBillingPeriod = billingPeriod || BillingPeriod.MONTHLY;

    // Create checkout session (service handles FREE plan validation)
    return await this.billingService.createCheckout(
      userId,
      planCode,
      selectedBillingPeriod,
    );
  }

  /**
   * Get billing portal URL or token for a user.
   * GET /api/billing/portal
   *
   * @param req Authenticated request with user information
   * @returns Portal URL or token
   * Note: Polar uses Customer Portal API with tokens, not direct URLs.
   * The returned URL includes a token that can be used with the Customer Portal API.
   */
  @Get('portal')
  async getBillingPortal(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    const userId = req.user.id;

    // Get billing portal URL or token
    return await this.billingService.getBillingPortalUrl(userId);
  }
}

