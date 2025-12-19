/*
  Update Polar Production Product IDs in PlanPrice table.
  
  This script updates the externalPriceId field in PlanPrice records with actual Polar production product IDs.
  It also creates missing PlanPrice records for 6-month and yearly billing periods.
  After creating products in Polar production dashboard, run this script to update the database.

  Usage:
    npx ts-node apps/backend/src/scripts/update-polar-product-ids.ts

  Requires DATABASE_URL to be set.
  
  Note: This script uses provider='polar' for production. For sandbox, use update-polar-product-ids-sandbox.ts instead.
*/

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Production provider name
 */
const PRODUCTION_PROVIDER = 'polar';

/**
 * Polar Production Product IDs mapping with pricing information.
 *
 * After creating products in Polar production dashboard, update these values with the actual production product IDs.
 *
 * Format: {
 *   planCode: {
 *     billingPeriod: { productId: '...', unitAmountCents: ... }
 *   }
 * }
 */
const POLAR_PRODUCT_CONFIG: Record<
  string,
  Record<string, { productId: string; unitAmountCents: number } | undefined>
> = {
  FREE: {
    monthly: {
      productId: '22ae599a-ee9c-4c5c-8395-f38b6906ea95',
      unitAmountCents: 0, // $0.00
    },
  },
  BASIC: {
    monthly: {
      productId: '62afbbeb-7ae2-4bc7-b1df-507b128f7543',
      unitAmountCents: 999, // $9.99
    },
    '6month': {
      productId: '9be000a5-2870-4a19-b855-16aaab28b18c',
      unitAmountCents: 5490, // $54.90
    },
    yearly: {
      productId: '3869c87a-9198-4ff7-bd5d-dcf34f9302cc',
      unitAmountCents: 9990, // $99.90
    },
  },
  PREMIUM: {
    monthly: {
      productId: '065202b9-de0d-43ef-a329-8868477dbaae',
      unitAmountCents: 1499, // $14.99
    },
    '6month': {
      productId: '6ef71ed6-13c6-4927-ad69-4bd44e66f206',
      unitAmountCents: 7990, // $79.90
    },
    yearly: {
      productId: '072d1216-24dc-4ce8-8ff9-de14521cd46f',
      unitAmountCents: 14990, // $149.90
    },
  },
};

async function main() {
  console.log(
    '[update-polar-product-ids] Starting production product ID updates...',
  );
  console.log(
    `[update-polar-product-ids] Using provider: ${PRODUCTION_PROVIDER}`,
  );

  for (const [planCode, billingPeriods] of Object.entries(
    POLAR_PRODUCT_CONFIG,
  )) {
    console.log(`[update-polar-product-ids] Processing plan: ${planCode}`);

    // Get plan
    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan) {
      console.warn(
        `[update-polar-product-ids] Plan ${planCode} not found, skipping...`,
      );
      continue;
    }

    console.log(
      `[update-polar-product-ids] Found plan ${planCode} with ID: ${plan.id}`,
    );

    // Update each billing period
    for (const [billingPeriod, config] of Object.entries(billingPeriods)) {
      if (!config) {
        console.warn(
          `[update-polar-product-ids] Skipping ${planCode} ${billingPeriod} - no config provided`,
        );
        continue;
      }

      const { productId, unitAmountCents } = config;

      if (!productId || productId.startsWith('YOUR_POLAR_')) {
        console.warn(
          `[update-polar-product-ids] Skipping ${planCode} ${billingPeriod} - product ID not set (placeholder: ${productId})`,
        );
        continue;
      }

      // Check if PlanPrice exists for this plan, provider, and billing period
      const existingPrice = await prisma.planPrice.findFirst({
        where: {
          planId: plan.id,
          provider: PRODUCTION_PROVIDER,
          billingPeriod: billingPeriod,
        },
      });

      if (existingPrice) {
        // Update existing price
        console.log(
          `[update-polar-product-ids] Found existing PlanPrice for ${planCode} ${billingPeriod} (ID: ${existingPrice.id}, current externalPriceId: ${existingPrice.externalPriceId}, current planId: ${existingPrice.planId})`,
        );

        // Verify planId matches (safety check)
        if (existingPrice.planId !== plan.id) {
          console.error(
            `[update-polar-product-ids] ERROR: PlanPrice ID ${existingPrice.id} has planId ${existingPrice.planId} but expected ${plan.id} for plan ${planCode}. This is a data consistency issue.`,
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
              `[update-polar-product-ids] Updated ${planCode} ${billingPeriod} (ID: ${existingPrice.id}) price: $${(unitAmountCents / 100).toFixed(2)}`,
            );
          } else {
            console.log(
              `[update-polar-product-ids] ${planCode} ${billingPeriod} already has correct product ID and price: ${productId}`,
            );
          }
        } else {
          // Need to update externalPriceId - check for conflicts first
          // Check if this product ID is already used by another PlanPrice
          const conflictingPrice = await prisma.planPrice.findUnique({
            where: {
              provider_externalPriceId: {
                provider: PRODUCTION_PROVIDER,
                externalPriceId: productId,
              },
            },
          });

          if (conflictingPrice && conflictingPrice.id !== existingPrice.id) {
            console.error(
              `[update-polar-product-ids] ERROR: Product ID ${productId} is already used by another PlanPrice (ID: ${conflictingPrice.id}, PlanID: ${conflictingPrice.planId}, BillingPeriod: ${conflictingPrice.billingPeriod})`,
            );
            continue;
          }

          // Update existing price with new product ID and pricing
          // Use update with the unique constraint key to handle externalPriceId change
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
              `[update-polar-product-ids] Updated ${planCode} ${billingPeriod} (ID: ${existingPrice.id}, PlanID: ${plan.id}) with product ID: ${productId}, price: $${(unitAmountCents / 100).toFixed(2)}`,
            );
          } catch (error: any) {
            console.error(
              `[update-polar-product-ids] ERROR updating ${planCode} ${billingPeriod}: ${error.message}`,
            );
            if (error.code === 'P2002') {
              console.error(
                `[update-polar-product-ids] Unique constraint violation - product ID ${productId} may already be in use`,
              );
            }
            continue;
          }
        }
      } else {
        // PlanPrice doesn't exist - create new one
        // Check if this product ID is already used
        const conflictingPrice = await prisma.planPrice.findUnique({
          where: {
            provider_externalPriceId: {
              provider: PRODUCTION_PROVIDER,
              externalPriceId: productId,
            },
          },
        });

        if (conflictingPrice) {
          console.error(
            `[update-polar-product-ids] ERROR: Product ID ${productId} is already used by another PlanPrice (ID: ${conflictingPrice.id}, Plan: ${conflictingPrice.planId}, BillingPeriod: ${conflictingPrice.billingPeriod})`,
          );
          continue;
        }

        // Create new PlanPrice record for production
        try {
          const newPrice = await prisma.planPrice.create({
            data: {
              planId: plan.id,
              provider: PRODUCTION_PROVIDER, // Use 'polar' for production
              externalPriceId: productId,
              billingPeriod: billingPeriod,
              currency: 'USD',
              unitAmountCents: unitAmountCents,
              isActive: true,
            },
          });
          console.log(
            `[update-polar-product-ids] Created ${planCode} ${billingPeriod} (ID: ${newPrice.id}, PlanID: ${plan.id}) with product ID: ${productId}, price: $${(unitAmountCents / 100).toFixed(2)}`,
          );
        } catch (error: any) {
          console.error(
            `[update-polar-product-ids] ERROR creating ${planCode} ${billingPeriod}: ${error.message}`,
          );
          if (error.code === 'P2002') {
            console.error(
              `[update-polar-product-ids] Unique constraint violation - product ID ${productId} may already be in use, or there's a duplicate (planId: ${plan.id}, billingPeriod: ${billingPeriod})`,
            );
          }
          if (error.code === 'P2003') {
            console.error(
              `[update-polar-product-ids] Foreign key constraint violation - planId ${plan.id} may not exist`,
            );
          }
          continue;
        }
      }
    }
  }

  console.log(
    '[update-polar-product-ids] Production product ID updates completed!',
  );
  console.log('[update-polar-product-ids] Summary:');
  console.log(
    '[update-polar-product-ids] Verify updated product IDs in database:',
  );
  console.log(
    '  SELECT p.code, pp.provider, pp."billingPeriod", pp."externalPriceId", pp."unitAmountCents", pp."isActive"',
  );
  console.log('  FROM "Plan" p');
  console.log('  JOIN "PlanPrice" pp ON p.id = pp."planId"');
  console.log("  WHERE pp.provider IN ('polar', 'polar-sandbox')");
  console.log('  ORDER BY p.code, pp.provider, pp."billingPeriod";');

  // Show summary of what was created/updated (both production and sandbox)
  const allPrices = await prisma.planPrice.findMany({
    where: {
      provider: {
        in: [PRODUCTION_PROVIDER, 'polar-sandbox'],
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
    '\n[update-polar-product-ids] Current PlanPrice records (production and sandbox):',
  );
  for (const price of allPrices) {
    console.log(
      `  - ${price.plan.code} [${price.provider}] ${price.billingPeriod}: ${price.externalPriceId} ($${(price.unitAmountCents / 100).toFixed(2)}) [ID: ${price.id}, PlanID: ${price.planId}]`,
    );
  }
}

main()
  .catch((e) => {
    console.error('[update-polar-product-ids] Error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
