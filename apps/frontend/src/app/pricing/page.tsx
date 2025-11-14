"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCheckoutMutation } from "@/lib/hooks/use-billing";
import { BillingPeriod } from "@/lib/api/billing";
import { toast } from "sonner";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  trackEvent,
  trackPageView,
  AnalyticsEvent,
} from "@/lib/analytics/analytics";

/**
 * Plan configuration matching the database seed data.
 * This should ideally be fetched from the backend, but for Phase 4
 * we'll hardcode based on seed-plans.ts structure.
 * Prices are stored in cents from the database PlanPrice table.
 */
interface PlanData {
  code: "FREE" | "BASIC" | "PREMIUM";
  name: string;
  description: string;
  prices: {
    monthly: number; // in cents
    "6month": number; // in cents
    yearly: number; // in cents
  };
  limits: Array<{
    resource: string;
    label: string;
    value: number | string;
  }>;
  features: string[];
  isPopular?: boolean;
}

const PLANS: PlanData[] = [
  {
    code: "FREE",
    name: "Free",
    description: "Perfect for beginners to get started with Mandarin learning",
    prices: {
      monthly: 0,
      "6month": 0,
      yearly: 0,
    },
    limits: [
      {
        resource: "convo_message_text",
        label: "Conversation messages",
        value: 60,
      },
      { resource: "convo_message_audio", label: "Audio messages", value: 20 },
      { resource: "convo_tts_seconds", label: "TTS minutes", value: "15" },
      {
        resource: "lesson_custom_generated",
        label: "Custom lessons",
        value: 8,
      },
      {
        resource: "curriculum_generated",
        label: "Curriculum generations",
        value: 5,
      },
      { resource: "assessment_taken", label: "Assessments", value: 1 },
    ],
    features: [
      "Flashcards with SRS (max 100 flashcards)",
      "Full dictionary access",
      "Basic conversation practice",
      "AI-guided lessons",
    ],
  },
  {
    code: "BASIC",
    name: "Basic",
    description: "For serious learners who want more practice",
    prices: {
      monthly: 999, // $9.99
      "6month": 5499, // $54.99 (from database)
      yearly: 9999, // $99.99 (from database)
    },
    limits: [
      {
        resource: "convo_message_text",
        label: "Conversation messages",
        value: 400,
      },
      { resource: "convo_message_audio", label: "Audio messages", value: 150 },
      { resource: "convo_tts_seconds", label: "TTS minutes", value: "120" },
      {
        resource: "lesson_custom_generated",
        label: "Custom lessons",
        value: 60,
      },
      {
        resource: "curriculum_generated",
        label: "Curriculum generations",
        value: 30,
      },
      { resource: "assessment_taken", label: "Assessments", value: 4 },
    ],
    features: [
      "Unlimited flashcards",
      "Full dictionary access",
      "2 concurrent conversation streams",
      "Advanced conversation coach",
      "Unlimited AI lessons",
    ],
    isPopular: true,
  },
  {
    code: "PREMIUM",
    name: "Premium",
    description: "For advanced learners who want unlimited practice",
    prices: {
      monthly: 1499, // $14.99
      "6month": 7999, // $79.90 (from database)
      yearly: 14990, // $149.90 (from database)
    },
    limits: [
      {
        resource: "convo_message_text",
        label: "Conversation messages",
        value: 2000,
      },
      { resource: "convo_message_audio", label: "Audio messages", value: 600 },
      { resource: "convo_tts_seconds", label: "TTS minutes", value: "360" },
      {
        resource: "lesson_custom_generated",
        label: "Custom lessons",
        value: 200,
      },
      {
        resource: "curriculum_generated",
        label: "Curriculum generations",
        value: 120,
      },
      { resource: "assessment_taken", label: "Assessments", value: 12 },
    ],
    features: [
      "Unlimited flashcards",
      "Full dictionary access",
      "3 concurrent conversation streams",
      "Advanced conversation coach",
      "Unlimited AI lessons",
    ],
  },
];

/**
 * Pricing Page Component (with Suspense boundary for useSearchParams)
 */
export default function PricingPage() {
  return (
    <Suspense fallback={<PricingPageSkeleton />}>
      <PricingPageContent />
    </Suspense>
  );
}

/**
 * Pricing Page Content Component
 *
 * Features:
 * - Three plan cards (FREE/BASIC/PREMIUM)
 * - Interactive CTAs (checkout for logged-in, auth redirect for logged-out)
 * - Accessibility features (aria-labelledby, tabular numbers, focus rings)
 * - Loading states and error handling
 * - Skeleton loader
 */
function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authStore = useAuthStore();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const checkoutMutation = useCheckoutMutation();
  const prefersReducedMotion = useReducedMotion();

  const [selectedPlanCode, setSelectedPlanCode] = useState<
    "FREE" | "BASIC" | "PREMIUM" | null
  >(null);
  const [selectedBillingPeriod, setSelectedBillingPeriod] =
    useState<BillingPeriod>(BillingPeriod.MONTHLY);

  // Initialize auth state on mount (pricing page is public, but we need to know auth status)
  useEffect(() => {
    const initialize = (
      authStore as unknown as { initialize?: () => Promise<void> }
    ).initialize;
    if (initialize && authLoading) {
      void initialize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track page view on mount
  useEffect(() => {
    trackPageView("pricing", {
      isAuthenticated: isAuthenticated || false,
    });
    trackEvent(AnalyticsEvent.PRICING_PAGE_VIEWED, {
      isAuthenticated: isAuthenticated || false,
    });
  }, [isAuthenticated]);

  // Handle plan selection from query params (e.g., /pricing?plan=BASIC)
  useEffect(() => {
    const planParam = searchParams.get("plan");
    if (planParam && ["FREE", "BASIC", "PREMIUM"].includes(planParam)) {
      const planCode = planParam as "FREE" | "BASIC" | "PREMIUM";
      setSelectedPlanCode(planCode);
      // Track plan viewed when selected via query params
      trackEvent(AnalyticsEvent.PRICING_PLAN_VIEWED, {
        planCode,
        billingPeriod: selectedBillingPeriod,
        source: "query_param",
      });
    }
  }, [searchParams, selectedBillingPeriod]);

  // Handle checkout for logged-in users
  const handleCheckout = async (planCode: "FREE" | "BASIC" | "PREMIUM") => {
    if (planCode === "FREE") {
      // FREE plan doesn't require checkout
      toast.info("You're already on the Free plan!");
      trackEvent(AnalyticsEvent.PRICING_CTA_CLICKED, {
        planCode: "FREE",
        action: "free_plan_clicked",
        billingPeriod: selectedBillingPeriod,
      });
      return;
    }

    try {
      setSelectedPlanCode(planCode);

      // Track checkout started
      trackEvent(AnalyticsEvent.PRICING_CHECKOUT_STARTED, {
        planCode,
        billingPeriod: selectedBillingPeriod,
      });

      const response = await checkoutMutation.mutateAsync({
        planCode,
        billingPeriod: selectedBillingPeriod,
      });

      // Track checkout success
      trackEvent(AnalyticsEvent.PRICING_CHECKOUT_SUCCESS, {
        planCode,
        billingPeriod: selectedBillingPeriod,
        checkoutUrl: response.url,
      });

      // Redirect to checkout URL
      if (response.url) {
        window.location.href = response.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to start checkout. Please try again.";

      // Track checkout failure
      trackEvent(AnalyticsEvent.PRICING_CHECKOUT_FAILURE, {
        planCode,
        billingPeriod: selectedBillingPeriod,
        error: errorMessage,
      });

      toast.error(
        <div className="flex flex-col gap-2">
          <div className="font-semibold">Checkout failed</div>
          <div className="text-sm opacity-90">{errorMessage}</div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleCheckout(planCode)}
              className="px-3 py-1.5 bg-white text-black rounded-md text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Retry
            </button>
            <Link
              href="/support"
              className="px-3 py-1.5 border border-white/20 text-white rounded-md text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Contact support
            </Link>
          </div>
        </div>,
        {
          duration: 10000,
        }
      );
    }
  };

  // Handle CTA click (checkout for logged-in, auth redirect for logged-out)
  const handleCtaClick = (planCode: "FREE" | "BASIC" | "PREMIUM") => {
    // If auth is still loading, treat as logged-out (will redirect to signup)
    const isLoggedIn = !authLoading && isAuthenticated;

    // Track CTA clicked
    trackEvent(AnalyticsEvent.PRICING_CTA_CLICKED, {
      planCode,
      billingPeriod: selectedBillingPeriod,
      isAuthenticated: isLoggedIn,
      action: isLoggedIn ? "checkout" : "auth_redirect",
    });

    if (planCode === "FREE") {
      // FREE plan: redirect to signup if not logged in, or show message if logged in
      if (!isLoggedIn) {
        const redirectUrl = `/pricing?plan=FREE`;
        router.push(`/signup?redirect=${encodeURIComponent(redirectUrl)}`);
      } else {
        toast.info("You're already on the Free plan!");
      }
      return;
    }

    if (isLoggedIn) {
      // Logged-in: trigger checkout
      void handleCheckout(planCode);
    } else {
      // Logged-out or loading: redirect to auth with return URL (URL encoded)
      const redirectUrl = `/pricing?plan=${planCode}`;
      router.push(`/signup?redirect=${encodeURIComponent(redirectUrl)}`);
    }
  };

  // Don't block rendering on auth loading - pricing page is public
  // Auth state will update asynchronously and buttons will adjust accordingly

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { y: 16, opacity: 0 },
        whileInView: { y: 0, opacity: 1 },
        viewport: { once: true, amount: 0.6 },
        transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] },
      };

  return (
    <div className="min-h-screen bg-[#222831]">
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        {/* Hero Section */}
        <motion.section
          {...motionProps}
          className="text-center mb-12 md:mb-16"
          aria-labelledby="pricing-title"
        >
          <h1
            id="pricing-title"
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4"
          >
            Pricing
          </h1>
          <p className="text-lg md:text-xl text-white/70 mb-6 max-w-2xl mx-auto">
            Simple plans to get you speaking. Start free; upgrade anytime.
          </p>
          {isAuthenticated && (
            <Link
              href="/account/usage"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-4 text-sm md:text-base"
            >
              View your current usage →
            </Link>
          )}
        </motion.section>

        {/* Billing Period Selector */}
        <motion.div
          {...motionProps}
          className="flex justify-center mb-8 md:mb-12"
          role="tablist"
          aria-label="Billing period selection"
        >
          <div className="inline-flex rounded-lg border border-white/10 bg-neutral-950 p-1">
            {(() => {
              // Calculate average discount across paid plans
              const paidPlans = PLANS.filter((p) => p.code !== "FREE");
              const sixMonthDiscount =
                paidPlans.length > 0
                  ? Math.round(
                      paidPlans.reduce((sum, plan) => {
                        const monthlyEquivalent = plan.prices.monthly * 6;
                        const savings =
                          monthlyEquivalent - plan.prices["6month"];
                        const planDiscount =
                          monthlyEquivalent > 0
                            ? Math.round((savings / monthlyEquivalent) * 100)
                            : 0;
                        return sum + planDiscount;
                      }, 0) / paidPlans.length
                    )
                  : 0;

              const yearlyDiscount =
                paidPlans.length > 0
                  ? Math.round(
                      paidPlans.reduce((sum, plan) => {
                        const monthlyEquivalent = plan.prices.monthly * 12;
                        const savings = monthlyEquivalent - plan.prices.yearly;
                        const planDiscount =
                          monthlyEquivalent > 0
                            ? Math.round((savings / monthlyEquivalent) * 100)
                            : 0;
                        return sum + planDiscount;
                      }, 0) / paidPlans.length
                    )
                  : 0;

              return [
                {
                  value: BillingPeriod.MONTHLY,
                  label: "Monthly",
                  discount: 0,
                },
                {
                  value: BillingPeriod.SIX_MONTH,
                  label: "6 Months",
                  discount: sixMonthDiscount,
                },
                {
                  value: BillingPeriod.YEARLY,
                  label: "Yearly",
                  discount: yearlyDiscount,
                },
              ].map((period) => (
                <button
                  key={period.value}
                  type="button"
                  role="tab"
                  aria-selected={selectedBillingPeriod === period.value}
                  onClick={() => {
                    const previousPeriod = selectedBillingPeriod;
                    setSelectedBillingPeriod(period.value);
                    // Track billing period change
                    if (previousPeriod !== period.value) {
                      trackEvent(
                        AnalyticsEvent.PRICING_BILLING_PERIOD_CHANGED,
                        {
                          previousBillingPeriod: previousPeriod,
                          newBillingPeriod: period.value,
                          discount: period.discount,
                        }
                      );
                    }
                  }}
                  className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 cursor-pointer ${
                    selectedBillingPeriod === period.value
                      ? "bg-white text-black shadow-sm"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {period.label}
                    {period.discount > 0 && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-semibold">
                        -{period.discount}%
                      </span>
                    )}
                  </span>
                </button>
              ));
            })()}
          </div>
        </motion.div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 lg:items-stretch">
          {PLANS.map((plan, index) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              index={index}
              billingPeriod={selectedBillingPeriod}
              isAuthenticated={isAuthenticated}
              authLoading={authLoading}
              isLoading={
                checkoutMutation.isPending && selectedPlanCode === plan.code
              }
              onCtaClick={() => handleCtaClick(plan.code)}
              onPlanView={() => {
                // Track plan viewed when card is in viewport
                trackEvent(AnalyticsEvent.PRICING_PLAN_VIEWED, {
                  planCode: plan.code,
                  billingPeriod: selectedBillingPeriod,
                  source: "card_view",
                });
              }}
              motionProps={prefersReducedMotion ? {} : motionProps}
            />
          ))}
        </div>

        {/* FAQ/Footnotes Section */}
        <motion.section
          {...motionProps}
          className="mt-16 md:mt-24 max-w-3xl mx-auto"
          aria-labelledby="pricing-faq-title"
        >
          <h2
            id="pricing-faq-title"
            className="text-2xl font-bold text-white mb-6 text-center"
          >
            Frequently Asked Questions
          </h2>
          <div className="space-y-4 text-white/70">
            <div>
              <h3 className="font-semibold text-white mb-2">
                What payment provider do you use?
              </h3>
              <p className="text-sm">
                We use Polar for secure payment processing. All payments are
                processed securely and we never store your credit card
                information.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">
                What is your refund policy?
              </h3>
              <p className="text-sm">
                We offer a 30-day money-back guarantee. If you&apos;re not
                satisfied with your subscription, contact support within 30 days
                for a full refund.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">
                Can I change plans later?
              </h3>
              <p className="text-sm">
                Yes! You can upgrade or downgrade your plan at any time from
                your account settings. Changes take effect immediately.
              </p>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

/**
 * Plan Card Component
 *
 * Features:
 * - Accessible structure (section with aria-labelledby)
 * - Tabular numbers for prices
 * - Keyboard focus rings
 * - Loading states
 */
interface PlanCardProps {
  plan: PlanData;
  index: number;
  billingPeriod: BillingPeriod;
  isAuthenticated: boolean;
  authLoading: boolean;
  isLoading: boolean;
  onCtaClick: () => void;
  onPlanView?: () => void;
  motionProps: Record<string, unknown>;
}

/**
 * Get price for a billing period from plan data.
 * Calculates discount percentage compared to monthly pricing.
 */
function getPriceForPeriod(
  plan: PlanData,
  billingPeriod: BillingPeriod
): { priceCents: number; priceDisplay: string; discount: number } {
  let priceKey: "monthly" | "6month" | "yearly";

  switch (billingPeriod) {
    case BillingPeriod.MONTHLY:
      priceKey = "monthly";
      break;
    case BillingPeriod.SIX_MONTH:
      priceKey = "6month";
      break;
    case BillingPeriod.YEARLY:
      priceKey = "yearly";
      break;
    default:
      priceKey = "monthly";
  }

  const priceCents = plan.prices[priceKey];

  // Calculate discount percentage compared to monthly equivalent
  let discount = 0;
  if (priceCents > 0 && plan.prices.monthly > 0) {
    let monthlyEquivalent: number;
    switch (billingPeriod) {
      case BillingPeriod.SIX_MONTH:
        monthlyEquivalent = plan.prices.monthly * 6;
        break;
      case BillingPeriod.YEARLY:
        monthlyEquivalent = plan.prices.monthly * 12;
        break;
      default:
        monthlyEquivalent = plan.prices.monthly;
    }

    if (monthlyEquivalent > priceCents) {
      const savings = monthlyEquivalent - priceCents;
      discount = Math.round((savings / monthlyEquivalent) * 100);
    }
  }

  return {
    priceCents,
    priceDisplay: `$${(priceCents / 100).toFixed(2)}`,
    discount,
  };
}

function PlanCard({
  plan,
  index,
  billingPeriod,
  isAuthenticated,
  authLoading,
  isLoading,
  onCtaClick,
  onPlanView,
  motionProps,
}: PlanCardProps) {
  const cardId = `plan-${plan.code.toLowerCase()}`;
  const titleId = `${cardId}-title`;

  const isFree = plan.code === "FREE";
  const isLoggedIn = !authLoading && isAuthenticated;
  const { priceDisplay, discount, priceCents } = getPriceForPeriod(
    plan,
    billingPeriod
  );

  // Track plan view when card enters viewport using Intersection Observer
  useEffect(() => {
    if (!onPlanView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            onPlanView();
            // Only track once per mount - disconnect after first view
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );

    // Use a ref or querySelector to find the card element
    // We'll use setTimeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const cardElement = document.getElementById(cardId);
      if (cardElement) {
        observer.observe(cardElement);
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [onPlanView, cardId]);

  // Calculate per-month equivalent for display
  const getPeriodLabel = () => {
    switch (billingPeriod) {
      case BillingPeriod.MONTHLY:
        return "/mo";
      case BillingPeriod.SIX_MONTH:
        return "/6mo";
      case BillingPeriod.YEARLY:
        return "/yr";
      default:
        return "/mo";
    }
  };

  const getPerMonthPrice = () => {
    if (isFree) return null;
    switch (billingPeriod) {
      case BillingPeriod.MONTHLY:
        return null; // Don't show per-month for monthly
      case BillingPeriod.SIX_MONTH:
        // Calculate per-month from 6-month price
        const sixMonthPerMonth = priceCents / 6;
        return `$${(sixMonthPerMonth / 100).toFixed(2)}/mo`;
      case BillingPeriod.YEARLY:
        // Calculate per-month from yearly price
        const yearlyPerMonth = priceCents / 12;
        return `$${(yearlyPerMonth / 100).toFixed(2)}/mo`;
      default:
        return null;
    }
  };

  const ctaLabel = isFree
    ? isLoggedIn
      ? "Current plan"
      : "Get started"
    : isLoggedIn
      ? `Upgrade to ${plan.name}`
      : `Start ${plan.name}`;

  return (
    <motion.section
      {...(typeof motionProps === "object" && motionProps !== null
        ? motionProps
        : {})}
      transition={
        typeof motionProps === "object" &&
        motionProps !== null &&
        "transition" in motionProps
          ? {
              ...(motionProps.transition as Record<string, unknown>),
              delay: index * 0.1,
            }
          : { delay: index * 0.1 }
      }
      className={`relative rounded-2xl border p-6 md:p-8 flex flex-col ${
        plan.isPopular
          ? "border-white/20 bg-black shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
          : "border-white/10 bg-neutral-950"
      }`}
      aria-labelledby={titleId}
      id={cardId}
    >
      {/* Popular Badge */}
      {plan.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white border border-white/20 backdrop-blur">
          Most popular
        </div>
      )}

      {/* Plan Header */}
      <div className="mb-4">
        <h2
          id={titleId}
          className={`text-lg font-semibold mb-2 ${plan.isPopular ? "text-white" : "text-white/70"}`}
        >
          {plan.name}
        </h2>
        <p className="text-sm text-white/60 mb-4">{plan.description}</p>
        <div className="mb-2">
          <div className="flex items-baseline gap-1">
            <span
              className="text-4xl md:text-5xl font-bold text-white tabular-nums"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {priceDisplay}
            </span>
            {!isFree && (
              <span className="text-white/70 text-lg">{getPeriodLabel()}</span>
            )}
          </div>
          {!isFree && getPerMonthPrice() && (
            <div className="text-sm text-white/60 mt-1">
              {getPerMonthPrice()} billed{" "}
              {billingPeriod === BillingPeriod.SIX_MONTH
                ? "every 6 months"
                : "annually"}
            </div>
          )}
          {!isFree && discount > 0 && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                <span className="font-semibold">Save {discount}%</span>
                {billingPeriod === BillingPeriod.SIX_MONTH && (
                  <span className="text-green-300/80">vs monthly</span>
                )}
                {billingPeriod === BillingPeriod.YEARLY && (
                  <span className="text-green-300/80">vs monthly</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Limits (Usage Quotas) */}
      <div className="mb-6 flex-1">
        <h3 className="text-sm font-semibold text-white/90 mb-3">
          Monthly Limits
        </h3>
        <ul className="space-y-2 text-sm text-white/70">
          {plan.limits.map((limit) => (
            <li
              key={limit.resource}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                <span>{limit.label}</span>
              </span>
              <span className="font-semibold text-white tabular-nums">
                {typeof limit.value === "number"
                  ? limit.value.toLocaleString("en-US")
                  : limit.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Plan Features */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-white/90 mb-3">Features</h3>
        <ul className="space-y-2 text-sm text-white/70">
          {plan.features.map((feature, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA Button */}
      <div className="mt-auto pt-4">
        {isFree ? (
          <Button
            variant="google"
            size="full"
            onClick={onCtaClick}
            disabled={isLoading || authLoading || isLoggedIn}
            loading={isLoading || authLoading}
            className="w-full min-h-[44px] text-base font-medium border-white/20 hover:border-white/30 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 transition-all"
            aria-label={ctaLabel}
          >
            {isLoading || authLoading
              ? isLoading
                ? "Processing..."
                : "Loading..."
              : ctaLabel}
          </Button>
        ) : plan.isPopular ? (
          <Button
            variant="primary"
            size="full"
            onClick={onCtaClick}
            disabled={isLoading || authLoading}
            loading={isLoading || authLoading}
            className="w-full min-h-[44px] text-base font-semibold bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_16px_rgba(255,255,255,0.25)] border border-white/10 focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 transition-all"
            aria-label={ctaLabel}
          >
            {isLoading || authLoading
              ? isLoading
                ? "Processing..."
                : "Loading..."
              : ctaLabel}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="full"
            onClick={onCtaClick}
            disabled={isLoading || authLoading}
            loading={isLoading || authLoading}
            className="w-full min-h-[44px] text-base font-semibold bg-[#4040f2] hover:bg-[#3636d9] text-white shadow-[0_8px_20px_rgba(64,64,242,0.35)] hover:shadow-[0_10px_24px_rgba(64,64,242,0.45)] focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 transition-all"
            aria-label={ctaLabel}
          >
            {isLoading || authLoading
              ? isLoading
                ? "Processing..."
                : "Loading..."
              : ctaLabel}
          </Button>
        )}
      </div>
    </motion.section>
  );
}

/**
 * Skeleton Loader for Pricing Page
 */
function PricingPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#222831]">
      <div className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        {/* Hero Skeleton */}
        <div className="text-center mb-12 md:mb-16">
          <div className="h-12 md:h-14 bg-white/10 rounded-lg w-48 mx-auto mb-4 animate-pulse" />
          <div className="h-6 bg-white/10 rounded-lg w-96 max-w-full mx-auto mb-6 animate-pulse" />
        </div>

        {/* Plan Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-neutral-950 p-6 md:p-8 space-y-4"
            >
              <div className="h-6 bg-white/10 rounded w-24 animate-pulse" />
              <div className="h-12 bg-white/10 rounded w-32 animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
                <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
                <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse" />
              </div>
              <div className="h-11 bg-white/10 rounded w-full animate-pulse mt-6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
