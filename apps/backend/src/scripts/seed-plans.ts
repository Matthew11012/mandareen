/*
  Seed Plans, Limits, Features, and Prices for billing system.
  - Creates FREE, BASIC, PREMIUM plans with their limits
  - Adds plan features
  - Creates placeholder Polar price entries (to be updated in Phase 3)

  Usage:
    npx ts-node apps/backend/src/scripts/seed-plans.ts
    OR
    npm run seed:plans (if added to package.json)

  Requires DATABASE_URL to be set.
*/

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Resource keys (canonical)
const RESOURCES = {
  CONVO_MESSAGE_TEXT: 'convo_message_text',
  CONVO_MESSAGE_AUDIO: 'convo_message_audio',
  CONVO_TTS_SECONDS: 'convo_tts_seconds',
  LESSON_CUSTOM_GENERATED: 'lesson_custom_generated',
  CURRICULUM_GENERATED: 'curriculum_generated',
  ASSESSMENT_TAKEN: 'assessment_taken',
  CONVO_STREAM: 'convo_stream',
  COMMUNITY_LESSON_FULL_VIEW: 'community_lesson_full_view',
  CURRICULUM_UNIT_FULL_ACCESS: 'curriculum_unit_full_access',
  CONVO_MANUAL_NOTES: 'convo_manual_notes',
} as const;

interface PlanLimitConfig {
  resource: string;
  monthlyCap: number;
  rpm?: number;
  burst?: number;
  concurrency?: number;
}

interface PlanConfig {
  code: string;
  name: string;
  description: string;
  displayPriceCents: number;
  limits: PlanLimitConfig[];
  features: Array<{ key: string; enabled: boolean; value?: any }>;
  polarPriceId: string; // Placeholder - update in Phase 3
}

/**
 * Normalize JSON value for Prisma Json field.
 * Prisma accepts JSON primitives, but Prisma Studio's editor prefers objects/arrays.
 * This function ensures values are properly formatted.
 */
function normalizeJsonValue(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }
  // For boolean/string/number primitives, wrap in object for better Prisma Studio compatibility
  if (
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return { value };
  }
  // Objects and arrays are fine as-is
  return value;
}

const PLANS: PlanConfig[] = [
  {
    code: 'FREE',
    name: 'Free',
    description: 'Perfect for beginners to get started with Mandarin learning',
    displayPriceCents: 0,
    polarPriceId: 'polar_price_free_monthly', // Placeholder
    limits: [
      {
        resource: RESOURCES.CONVO_MESSAGE_TEXT,
        monthlyCap: 60,
        rpm: 12,
        burst: 24,
      },
      {
        resource: RESOURCES.CONVO_MESSAGE_AUDIO,
        monthlyCap: 20,
        rpm: 30,
      },
      {
        resource: RESOURCES.CONVO_TTS_SECONDS,
        monthlyCap: 300, // 5 minutes
        rpm: 30,
      },
      {
        resource: RESOURCES.LESSON_CUSTOM_GENERATED,
        monthlyCap: 2,
        rpm: 240, // 4 per hour
      },
      {
        resource: RESOURCES.CURRICULUM_GENERATED,
        monthlyCap: 1,
        rpm: 4,
      },
      {
        resource: RESOURCES.ASSESSMENT_TAKEN,
        monthlyCap: 1,
      },
      {
        resource: RESOURCES.CONVO_STREAM,
        monthlyCap: 0, // Not used for monthlyCap, only concurrency
        concurrency: 1,
      },
      {
        resource: RESOURCES.COMMUNITY_LESSON_FULL_VIEW,
        monthlyCap: 10,
      },
      {
        resource: RESOURCES.CURRICULUM_UNIT_FULL_ACCESS,
        monthlyCap: 1,
      },
      {
        resource: RESOURCES.CONVO_MANUAL_NOTES,
        monthlyCap: 3,
      },
    ],
    features: [
      { key: 'dictionary_full', enabled: true }, // No value needed, enabled flag is sufficient
      { key: 'flashcards_max', enabled: true, value: 100 }, // FREE: max 100 flashcards
      { key: 'export_enabled', enabled: false },
      { key: 'priority_support', enabled: false },
    ],
  },
  {
    code: 'BASIC',
    name: 'Basic',
    description: 'For serious learners who want more practice',
    displayPriceCents: 999, // $9.99
    polarPriceId: 'polar_price_basic_monthly', // Placeholder
    limits: [
      {
        resource: RESOURCES.CONVO_MESSAGE_TEXT,
        monthlyCap: 400,
        rpm: 24,
        burst: 48,
      },
      {
        resource: RESOURCES.CONVO_MESSAGE_AUDIO,
        monthlyCap: 150,
        rpm: 30,
      },
      {
        resource: RESOURCES.CONVO_TTS_SECONDS,
        monthlyCap: 7200, // 120 minutes
        rpm: 30,
      },
      {
        resource: RESOURCES.LESSON_CUSTOM_GENERATED,
        monthlyCap: 60,
        rpm: 720, // 12 per hour
      },
      {
        resource: RESOURCES.CURRICULUM_GENERATED,
        monthlyCap: 30,
        rpm: 8,
      },
      {
        resource: RESOURCES.ASSESSMENT_TAKEN,
        monthlyCap: 4,
      },
      {
        resource: RESOURCES.CONVO_STREAM,
        monthlyCap: 0,
        concurrency: 2,
      },
      {
        resource: RESOURCES.COMMUNITY_LESSON_FULL_VIEW,
        monthlyCap: 0,
      },
      {
        resource: RESOURCES.CURRICULUM_UNIT_FULL_ACCESS,
        monthlyCap: 0,
      },
      {
        resource: RESOURCES.CONVO_MANUAL_NOTES,
        monthlyCap: 80,
      },
    ],
    features: [
      { key: 'dictionary_full', enabled: true }, // No value needed, enabled flag is sufficient
      { key: 'flashcards_max', enabled: true, value: null }, // BASIC: unlimited (null = unlimited)
      { key: 'export_enabled', enabled: false },
      { key: 'priority_support', enabled: false },
    ],
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: 'For advanced learners who want unlimited practice',
    displayPriceCents: 1499, // $14.99
    polarPriceId: 'polar_price_premium_monthly', // Placeholder
    limits: [
      {
        resource: RESOURCES.CONVO_MESSAGE_TEXT,
        monthlyCap: 2000,
        rpm: 48,
        burst: 96,
      },
      {
        resource: RESOURCES.CONVO_MESSAGE_AUDIO,
        monthlyCap: 600,
        rpm: 30,
      },
      {
        resource: RESOURCES.CONVO_TTS_SECONDS,
        monthlyCap: 18000, // 300 minutes
        rpm: 30,
      },
      {
        resource: RESOURCES.LESSON_CUSTOM_GENERATED,
        monthlyCap: 200,
        rpm: 1440, // 24 per hour
      },
      {
        resource: RESOURCES.CURRICULUM_GENERATED,
        monthlyCap: 120,
        rpm: 12,
      },
      {
        resource: RESOURCES.ASSESSMENT_TAKEN,
        monthlyCap: 12,
      },
      {
        resource: RESOURCES.CONVO_STREAM,
        monthlyCap: 0,
        concurrency: 3,
      },
      {
        resource: RESOURCES.COMMUNITY_LESSON_FULL_VIEW,
        monthlyCap: 0,
      },
      {
        resource: RESOURCES.CURRICULUM_UNIT_FULL_ACCESS,
        monthlyCap: 0,
      },
      {
        resource: RESOURCES.CONVO_MANUAL_NOTES,
        monthlyCap: 200,
      },
    ],
    features: [
      { key: 'dictionary_full', enabled: true }, // No value needed, enabled flag is sufficient
      { key: 'flashcards_max', enabled: true, value: null }, // PREMIUM: unlimited (null = unlimited)
      { key: 'export_enabled', enabled: true }, // Enabled, no additional value needed
      { key: 'priority_support', enabled: true }, // Enabled, no additional value needed
    ],
  },
];

async function main() {
  console.log('[seed-plans] Starting plan seeding...');

  for (const planConfig of PLANS) {
    console.log(`[seed-plans] Upserting plan: ${planConfig.code}`);

    // Upsert plan
    const plan = await prisma.plan.upsert({
      where: { code: planConfig.code },
      update: {
        name: planConfig.name,
        description: planConfig.description,
        displayPriceCents: planConfig.displayPriceCents,
        isActive: true,
      },
      create: {
        code: planConfig.code,
        name: planConfig.name,
        description: planConfig.description,
        displayPriceCents: planConfig.displayPriceCents,
        currency: 'USD',
        periodUnit: 'monthly',
        isActive: true,
      },
    });

    console.log(`[seed-plans] Plan ${planConfig.code} (ID: ${plan.id})`);

    // Upsert limits (update if exists, insert otherwise)
    const existingLimits = await prisma.planLimit.findMany({
      where: { planId: plan.id },
      select: { id: true, resource: true },
    });
    const existingLimitMap = new Map(
      existingLimits.map((limit) => [limit.resource, limit.id]),
    );

    for (const limitConfig of planConfig.limits) {
      const limitId = existingLimitMap.get(limitConfig.resource);

      if (limitId) {
        await prisma.planLimit.update({
          where: { id: limitId },
          data: {
            monthlyCap: limitConfig.monthlyCap,
            rpm: limitConfig.rpm ?? null,
            burst: limitConfig.burst ?? null,
            concurrency: limitConfig.concurrency ?? null,
          },
        });
      } else {
        await prisma.planLimit.create({
          data: {
            planId: plan.id,
            resource: limitConfig.resource,
            monthlyCap: limitConfig.monthlyCap,
            rpm: limitConfig.rpm ?? null,
            burst: limitConfig.burst ?? null,
            concurrency: limitConfig.concurrency ?? null,
          },
        });
      }
    }

    console.log(
      `[seed-plans] Added ${planConfig.limits.length} limits for ${planConfig.code}`,
    );

    // Upsert features
    for (const featureConfig of planConfig.features) {
      // Normalize JSON value: use null if no value provided, otherwise normalize
      const jsonValue =
        featureConfig.value !== undefined
          ? normalizeJsonValue(featureConfig.value)
          : null;

      await prisma.planFeature.upsert({
        where: {
          planId_key: {
            planId: plan.id,
            key: featureConfig.key,
          },
        },
        update: {
          enabled: featureConfig.enabled,
          value: jsonValue,
        },
        create: {
          planId: plan.id,
          key: featureConfig.key,
          enabled: featureConfig.enabled,
          value: jsonValue,
        },
      });
    }

    console.log(
      `[seed-plans] Added ${planConfig.features.length} features for ${planConfig.code}`,
    );

    // Upsert price (placeholder for Polar)
    await prisma.planPrice.upsert({
      where: {
        provider_externalPriceId: {
          provider: 'polar',
          externalPriceId: planConfig.polarPriceId,
        },
      },
      update: {
        planId: plan.id,
        unitAmountCents: planConfig.displayPriceCents,
        isActive: true,
      },
      create: {
        planId: plan.id,
        provider: 'polar',
        externalPriceId: planConfig.polarPriceId,
        billingPeriod: 'monthly',
        currency: 'USD',
        unitAmountCents: planConfig.displayPriceCents,
        isActive: true,
      },
    });

    console.log(
      `[seed-plans] Added Polar price placeholder for ${planConfig.code}`,
    );
  }

  console.log('[seed-plans] Seeding completed successfully!');
  console.log('[seed-plans] Summary:');
  console.log(`  - ${PLANS.length} plans created/updated`);
  console.log(
    `  - ${PLANS.reduce((sum, p) => sum + p.limits.length, 0)} total limits`,
  );
  console.log(
    `  - ${PLANS.reduce((sum, p) => sum + p.features.length, 0)} total features`,
  );
  console.log(`  - ${PLANS.length} Polar price placeholders`);
  console.log(
    '[seed-plans] Note: Update Polar price IDs in Phase 3 with actual values from Polar dashboard',
  );
}

main()
  .catch((e) => {
    console.error('[seed-plans] Error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
