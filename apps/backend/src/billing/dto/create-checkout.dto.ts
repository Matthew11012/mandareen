import { IsString, IsEnum, IsOptional } from 'class-validator';

/**
 * Billing period options for checkout.
 */
export enum BillingPeriod {
  MONTHLY = 'monthly',
  SIX_MONTH = '6month',
  YEARLY = 'yearly',
}

/**
 * DTO for creating a checkout session.
 */
export class CreateCheckoutDto {
  /**
   * Plan code (e.g., 'BASIC', 'PREMIUM').
   * FREE plan is not allowed for checkout (it's the default plan).
   */
  @IsString()
  planCode: string;

  /**
   * Billing period (optional, defaults to 'monthly').
   * Only applicable for BASIC and PREMIUM plans.
   */
  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;
}

