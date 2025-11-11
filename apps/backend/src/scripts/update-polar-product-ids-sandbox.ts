/*
  Update Polar Sandbox Product IDs in PlanPrice table.
  
  This script creates separate PlanPrice entries for sandbox environment.
  Sandbox entries use provider='polar-sandbox' to keep them separate from production.
  
  Usage:
    npx ts-node apps/backend/src/scripts/update-polar-product-ids-sandbox.ts

  Requires DATABASE_URL to be set.
  
  Note: Set BILLING_PROVIDER=polar-sandbox in your .env file to use sandbox product IDs.
*/

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Polar Sandbox Product IDs mapping with pricing information.
 *
 * After creating products in Polar sandbox dashboard, update these values with the actual sandbox product IDs.
 *
 * Format: {
 *   planCode: {
 *     billingPeriod: { productId: '...', unitAmountCents: ... }
 *   }
 * }
 */
const POLAR_SANDBOX_PRODUCT_CONFIG: Record<
  string,
  Record<string, { productId: string; unitAmountCents: number } | undefined>
> = {
  FREE: {
    monthly: {
      productId: '78db56a5-a739-4104-870e-bae2cf85f8da', // Update with actual sandbox product ID
      unitAmountCents: 0, // $0.00
    },
  },
  BASIC: {
    monthly: {
      productId: 'b8a750d3-d02f-4cd4-9295-45fcfb7ea8e2', // Update with actual sandbox product ID
      unitAmountCents: 999, // $9.99
    },
    '6month': {
      productId: 'bceb6dc8-6f86-47e1-a3a8-4b6383925e78', // Update with actual sandbox product ID
      unitAmountCents: 5499, // $54.99
    },
    yearly: {
      productId: 'ee16a63b-d475-4c42-a6b8-7b8e9f3adaa2', // Update with actual sandbox product ID
      unitAmountCents: 9990, // $99.90
    },
  },
  PREMIUM: {
    monthly: {
      productId: 'f7446cad-94df-471e-a41a-2e395f6eaa19', // Update with actual sandbox product ID
      unitAmountCents: 1499, // $14.99
    },
    '6month': {
      productId: '41560b9e-f5fa-4a4f-b491-0b190e081294', // Update with actual sandbox product ID
      unitAmountCents: 7990, // $79.90
    },
    yearly: {
      productId: '27df74f1-3848-4a09-952d-3185aebd749b', // Update with actual sandbox product ID
      unitAmountCents: 14990, // $149.90
    },
  },
};

const SANDBOX_PROVIDER = 'polar-sandbox';

async function main() {
  console.log(
    '[update-polar-product-ids-sandbox] Starting sandbox product ID updates...',
  );
  console.log(
    `[update-polar-product-ids-sandbox] Using provider: ${SANDBOX_PROVIDER}`,
  );

  for (const [planCode, billingPeriods] of Object.entries(
    POLAR_SANDBOX_PRODUCT_CONFIG,
  )) {
    console.log(
      `[update-polar-product-ids-sandbox] Processing plan: ${planCode}`,
    );

    // Get plan
    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan) {
      console.warn(
        `[update-polar-product-ids-sandbox] Plan ${planCode} not found, skipping...`,
      );
      continue;
    }

    console.log(
      `[update-polar-product-ids-sandbox] Found plan ${planCode} with ID: ${plan.id}`,
    );

    // Update each billing period
    for (const [billingPeriod, config] of Object.entries(billingPeriods)) {
      if (!config) {
        console.warn(
          `[update-polar-product-ids-sandbox] Skipping ${planCode} ${billingPeriod} - no config provided`,
        );
        continue;
      }

      const { productId, unitAmountCents } = config;

      if (!productId || productId.startsWith('YOUR_SANDBOX_')) {
        console.warn(
          `[update-polar-product-ids-sandbox] Skipping ${planCode} ${billingPeriod} - product ID not set (placeholder: ${productId})`,
        );
        continue;
      }

      // Check if PlanPrice exists for this plan, provider, and billing period
      const existingPrice = await prisma.planPrice.findFirst({
        where: {
          planId: plan.id,
          provider: SANDBOX_PROVIDER,
          billingPeriod: billingPeriod,
        },
      });

      if (existingPrice) {
        // Update existing price
        console.log(
          `[update-polar-product-ids-sandbox] Found existing PlanPrice for ${planCode} ${billingPeriod} (ID: ${existingPrice.id}, current externalPriceId: ${existingPrice.externalPriceId}, current planId: ${existingPrice.planId})`,
        );

        // Verify planId matches (safety check)
        if (existingPrice.planId !== plan.id) {
          console.error(
            `[update-polar-product-ids-sandbox] ERROR: PlanPrice ID ${existingPrice.id} has planId ${existingPrice.planId} but expected ${plan.id} for plan ${planCode}. This is a data consistency issue.`,
          );
          continue;
        }

        // Check if the externalPriceId is already set to this product ID
        if (existingPrice.externalPriceId === productId) {
          // Product ID is correct, but update price and status if needed
          if (
            existingPrice.unitAmountCents !== unitAmountCents ||
            existingPrice.isActive !== true
          ) {
            await prisma.planPrice.update({
              where: {
                id: existingPrice.id,
              },
              data: {
                unitAmountCents: unitAmountCents,
                isActive: true,
              },
            });
            console.log(
              `[update-polar-product-ids-sandbox] Updated ${planCode} ${billingPeriod} (ID: ${existingPrice.id}) price: $${(unitAmountCents / 100).toFixed(2)}`,
            );
          } else {
            console.log(
              `[update-polar-product-ids-sandbox] ${planCode} ${billingPeriod} already has correct product ID and price: ${productId}`,
            );
          }
        } else {
          // Need to update externalPriceId - check for conflicts first
          // Check if this product ID is already used by another PlanPrice
          const conflictingPrice = await prisma.planPrice.findUnique({
            where: {
              provider_externalPriceId: {
                provider: SANDBOX_PROVIDER,
                externalPriceId: productId,
              },
            },
          });

          if (conflictingPrice && conflictingPrice.id !== existingPrice.id) {
            console.error(
              `[update-polar-product-ids-sandbox] ERROR: Product ID ${productId} is already used by another PlanPrice (ID: ${conflictingPrice.id}, PlanID: ${conflictingPrice.planId}, BillingPeriod: ${conflictingPrice.billingPeriod})`,
            );
            continue;
          }

          // Update existing price with new product ID and pricing
          try {
            await prisma.planPrice.update({
              where: {
                id: existingPrice.id,
              },
              data: {
                externalPriceId: productId,
                unitAmountCents: unitAmountCents,
                isActive: true,
              },
            });
            console.log(
              `[update-polar-product-ids-sandbox] Updated ${planCode} ${billingPeriod} (ID: ${existingPrice.id}, PlanID: ${plan.id}) with product ID: ${productId}, price: $${(unitAmountCents / 100).toFixed(2)}`,
            );
          } catch (error: any) {
            console.error(
              `[update-polar-product-ids-sandbox] ERROR updating ${planCode} ${billingPeriod}: ${error.message}`,
            );
            if (error.code === 'P2002') {
              console.error(
                `[update-polar-product-ids-sandbox] Unique constraint violation - product ID ${productId} may already be in use`,
              );
            }
            continue;
          }
        }
      } else {
        // PlanPrice doesn't exist - create new one for sandbox
        // Check if this product ID is already used
        const conflictingPrice = await prisma.planPrice.findUnique({
          where: {
            provider_externalPriceId: {
              provider: SANDBOX_PROVIDER,
              externalPriceId: productId,
            },
          },
        });

        if (conflictingPrice) {
          console.error(
            `[update-polar-product-ids-sandbox] ERROR: Product ID ${productId} is already used by another PlanPrice (ID: ${conflictingPrice.id}, PlanID: ${conflictingPrice.planId}, BillingPeriod: ${conflictingPrice.billingPeriod})`,
          );
          continue;
        }

        // Create new PlanPrice record for sandbox
        try {
          const newPrice = await prisma.planPrice.create({
            data: {
              planId: plan.id,
              provider: SANDBOX_PROVIDER, // Use 'polar-sandbox' provider
              externalPriceId: productId,
              billingPeriod: billingPeriod,
              currency: 'USD',
              unitAmountCents: unitAmountCents,
              isActive: true,
            },
          });
          console.log(
            `[update-polar-product-ids-sandbox] Created ${planCode} ${billingPeriod} (ID: ${newPrice.id}, PlanID: ${plan.id}) with product ID: ${productId}, price: $${(unitAmountCents / 100).toFixed(2)}`,
          );
        } catch (error: any) {
          console.error(
            `[update-polar-product-ids-sandbox] ERROR creating ${planCode} ${billingPeriod}: ${error.message}`,
          );
          if (error.code === 'P2002') {
            console.error(
              `[update-polar-product-ids-sandbox] Unique constraint violation - product ID ${productId} may already be in use, or there's a duplicate (planId: ${plan.id}, billingPeriod: ${billingPeriod})`,
            );
          }
          if (error.code === 'P2003') {
            console.error(
              `[update-polar-product-ids-sandbox] Foreign key constraint violation - planId ${plan.id} may not exist`,
            );
          }
          continue;
        }
      }
    }
  }

  console.log(
    '[update-polar-product-ids-sandbox] Sandbox product ID updates completed!',
  );
  console.log('[update-polar-product-ids-sandbox] Summary:');
  console.log(
    '[update-polar-product-ids-sandbox] Verify updated product IDs in database:',
  );
  console.log(
    '  SELECT p.code, pp.provider, pp."billingPeriod", pp."externalPriceId", pp."unitAmountCents", pp."isActive"',
  );
  console.log('  FROM "Plan" p');
  console.log('  JOIN "PlanPrice" pp ON p.id = pp."planId"');
  console.log("  WHERE pp.provider IN ('polar', 'polar-sandbox')");
  console.log('  ORDER BY p.code, pp.provider, pp."billingPeriod";');

  // Show summary of what was created/updated
  const allPrices = await prisma.planPrice.findMany({
    where: {
      provider: {
        in: ['polar', SANDBOX_PROVIDER],
      },
    },
    include: {
      plan: true,
    },
    orderBy: [
      { plan: { code: 'asc' } },
      { provider: 'asc' },
      { billingPeriod: 'asc' },
    ],
  });

  console.log(
    '\n[update-polar-product-ids-sandbox] Current PlanPrice records (production and sandbox):',
  );
  for (const price of allPrices) {
    console.log(
      `  - ${price.plan.code} [${price.provider}] ${price.billingPeriod}: ${price.externalPriceId} ($${(price.unitAmountCents / 100).toFixed(2)}) [ID: ${price.id}, PlanID: ${price.planId}]`,
    );
  }
}

main()
  .catch((e) => {
    console.error('[update-polar-product-ids-sandbox] Error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
