"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import BezierEasing from "bezier-easing";
import { Check } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCheckoutMutation } from "@/lib/hooks/use-billing";
import { BillingPeriod } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ease = [0.2, 0.8, 0.2, 1] as const;

/**
 * Plan configuration matching the pricing page.
 * This should ideally be fetched from the backend, but for Phase 4
 * we'll use the same structure as the pricing page.
 */
interface LandingPlanData {
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

const LANDING_PLANS: LandingPlanData[] = [
  {
    code: "FREE",
    name: "Free",
    description: "Perfect for beginners to get started",
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
      "Flashcards (max 100 flashcards)",
      "Full dictionary access",
      "Basic conversation practice",
      "AI-guided lessons",
    ],
  },
  {
    code: "BASIC",
    name: "Basic",
    description: "For learners who want more practice",
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
    description: "For learners who want unlimited practice",
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
 * Get price for a billing period from plan data.
 * Calculates discount percentage compared to monthly pricing.
 */
function getPriceForPeriod(
  plan: LandingPlanData,
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

function AnimatedPrice({
  amountCents,
  className,
  prefersReducedMotion,
}: {
  amountCents: number;
  className?: string;
  prefersReducedMotion: boolean;
}) {
  const [displayValue, setDisplayValue] = useState<number>(amountCents);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(amountCents);
      return;
    }

    const startValue = displayValue;
    const endValue = amountCents;
    const duration = 800;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = priceEase(progress);
      const current = startValue + (endValue - startValue) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountCents, prefersReducedMotion]);

  const formatted = `$${(displayValue / 100).toFixed(2)}`;

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatted}
    </span>
  );
}

const priceEase = BezierEasing(0, 0.63, 0.15, 1);

export function PricingSection() {
  const reducedMotionPreference = useReducedMotion();
  const prefersReducedMotion = reducedMotionPreference ?? false;
  const router = useRouter();
  const authStore = useAuthStore();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const checkoutMutation = useCheckoutMutation();

  const [selectedBillingPeriod, setSelectedBillingPeriod] =
    useState<BillingPeriod>(BillingPeriod.MONTHLY);

  // Initialize auth state on mount (pricing section is public, but we need to know auth status)
  useEffect(() => {
    const initialize = (
      authStore as unknown as { initialize?: () => Promise<void> }
    ).initialize;
    if (initialize && authLoading) {
      void initialize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle checkout for logged-in users
  const handleCheckout = async (planCode: "FREE" | "BASIC" | "PREMIUM") => {
    if (planCode === "FREE") {
      toast.info("You're already on the Free plan!");
      return;
    }

    try {
      const response = await checkoutMutation.mutateAsync({
        planCode,
        billingPeriod: selectedBillingPeriod,
      });

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
    const isLoggedIn = !authLoading && isAuthenticated;

    if (planCode === "FREE") {
      if (!isLoggedIn) {
        router.push("/login"); // Redirect to login for unauthenticated users
      } else {
        router.push("/dashboard"); // Redirect to dashboard for authenticated users
      }
      return;
    }

    if (isLoggedIn) {
      void handleCheckout(planCode);
    } else {
      // Include plan and billing period in redirect URL for automatic checkout after signup
      const redirectUrl = `/pricing?plan=${planCode}&billingPeriod=${selectedBillingPeriod}`;
      router.push(`/signup?redirect=${encodeURIComponent(redirectUrl)}`);
    }
  };

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { y: 16, opacity: 0 },
        whileInView: { y: 0, opacity: 1 },
        viewport: { once: true, amount: 0.6 },
        transition: { duration: 0.6, ease },
      };

  return (
    <section id="pricing" className="max-w-6xl mx-auto px-4 py-16 md:py-24">
      <motion.h2
        {...motionProps}
        className="font-inter text-3xl md:text-4xl font-bold mb-4 text-white text-center"
      >
        Pricing
      </motion.h2>
      <motion.p
        {...motionProps}
        className="text-[var(--color-text-secondary)] mb-10 max-w-2xl font-inter text-center mx-auto"
      >
        Simple plans to get you speaking. Start free; upgrade anytime.
      </motion.p>

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
            const paidPlans = LANDING_PLANS.filter((p) => p.code !== "FREE");
            const sixMonthDiscount =
              paidPlans.length > 0
                ? Math.round(
                    paidPlans.reduce((sum, plan) => {
                      const monthlyEquivalent = plan.prices.monthly * 6;
                      const savings = monthlyEquivalent - plan.prices["6month"];
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
                onClick={() => setSelectedBillingPeriod(period.value)}
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
        {LANDING_PLANS.map((plan, index) => {
          const { priceDisplay, discount, priceCents } = getPriceForPeriod(
            plan,
            selectedBillingPeriod
          );
          const isFree = plan.code === "FREE";
          const ctaLabel = isFree
            ? !authLoading && isAuthenticated
              ? "Go to dashboard"
              : "Get started"
            : `Start ${plan.name}`;

          const monthsInPeriod =
            selectedBillingPeriod === BillingPeriod.SIX_MONTH
              ? 6
              : selectedBillingPeriod === BillingPeriod.YEARLY
                ? 12
                : 1;

          const highlightedCents =
            selectedBillingPeriod === BillingPeriod.MONTHLY
              ? priceCents
              : priceCents / monthsInPeriod;

          const recurringLabel =
            selectedBillingPeriod === BillingPeriod.SIX_MONTH
              ? "every 6 months"
              : selectedBillingPeriod === BillingPeriod.YEARLY
                ? "annually"
                : null;
          const totalBillingCopy =
            !isFree && recurringLabel
              ? `${priceDisplay} billed ${recurringLabel}`
              : null;
          return (
            <motion.div
              key={plan.code}
              {...(prefersReducedMotion
                ? {}
                : {
                    ...motionProps,
                    transition: {
                      ...motionProps.transition,
                      delay: index * 0.1,
                    },
                  })}
              className={`
                relative rounded-2xl border p-6 md:p-8 flex flex-col
                ${
                  plan.isPopular
                    ? "border-white/20 bg-black shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
                    : "border-white/10 bg-neutral-950"
                }
              `}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white border border-white/20 backdrop-blur font-inter">
                  Most popular
                </div>
              )}
              {/* Plan Header */}
              <div className="mb-4">
                <h3
                  className={`text-lg font-semibold mb-2 font-inter ${
                    plan.isPopular ? "text-white" : "text-white/70"
                  }`}
                >
                  {plan.name}
                </h3>
                <p className="text-sm text-white/60 font-inter mb-4">
                  {plan.description}
                </p>
                <div className="mb-2">
                  <div className="flex items-baseline gap-1">
                    <AnimatedPrice
                      amountCents={highlightedCents}
                      className="text-4xl md:text-5xl font-bold text-white font-inter tabular-nums"
                      prefersReducedMotion={prefersReducedMotion}
                    />
                    {!isFree && (
                      <span className="text-white/70 text-lg font-inter">
                        /mo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 min-h-[46px] flex flex-col justify-between">
                    <div className="text-sm text-white/60 font-inter leading-relaxed">
                      {totalBillingCopy ? (
                        totalBillingCopy
                      ) : (
                        <span className="invisible">placeholder</span>
                      )}
                    </div>
                    <div>
                      {!isFree && discount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded font-semibold font-inter">
                          Save {discount}%{" "}
                          <span className="text-green-300/80">vs monthly</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 font-semibold font-inter invisible">
                          Save 00% <span>vs monthly</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Plan Limits (Usage Quotas) */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white/90 mb-3 font-inter">
                  Monthly Limits
                </h3>
                <ul className="space-y-2 text-sm text-white/70 font-inter">
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
                <h3 className="text-sm font-semibold text-white/90 mb-3 font-inter">
                  Features
                </h3>
                <ul className="space-y-2 text-sm text-white/70 font-inter">
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
                  <Link
                    href={
                      !authLoading && isAuthenticated ? "/dashboard" : "/login"
                    }
                    className="w-full inline-flex items-center justify-center px-4 py-3 rounded-full font-inter font-medium transition-all duration-200 min-h-[44px] border border-white/10 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    aria-label={
                      !authLoading && isAuthenticated
                        ? "Go to dashboard"
                        : "Sign in to get started"
                    }
                  >
                    {authLoading ? "Loading..." : ctaLabel}
                  </Link>
                ) : (
                  <Button
                    onClick={() => handleCtaClick(plan.code)}
                    disabled={authLoading || checkoutMutation.isPending}
                    loading={authLoading || checkoutMutation.isPending}
                    className={`
                      w-full inline-flex items-center justify-center px-4 py-3 rounded-full font-inter font-medium text-md transition-all duration-200 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black
                      ${
                        plan.isPopular
                          ? "bg-white text-black hover:bg-white/80 border border-white/10"
                          : "bg-[#4040f2] border border-white/10 text-white hover:bg-[#3636d9]"
                      }
                    `}
                    aria-label={`Start ${plan.name} plan`}
                  >
                    {authLoading || checkoutMutation.isPending
                      ? "Processing..."
                      : ctaLabel}
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  const prefersReducedMotion = useReducedMotion();
  const inView = (delay = 0, duration = 0.6) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { y: 12, opacity: 0 },
          whileInView: { y: 0, opacity: 1 },
          viewport: { once: true, amount: 0.6 },
          transition: { duration, ease, delay },
        };

  return (
    <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-start">
        <motion.div
          {...inView(0, 0.5)}
          className="group rounded-2xl border border-white/10 bg-neutral-950 p-6"
        >
          <div className="text-sm text-white/70">Step 1</div>
          <h3 className="mt-1 font-inter text-lg font-semibold text-white">
            Placement test
          </h3>
          <p className="mt-1 text-[var(--color-text-secondary)]">
            Know your level in minutes and get a plan.
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/40 overflow-hidden">
            <Image
              src="/placement_test.png"
              alt="Placement test"
              width={560}
              height={360}
              className="w-full h-auto object-cover"
            />
          </div>
        </motion.div>
        <motion.div
          {...inView(0.03, 0.6)}
          className="group rounded-2xl border border-white/10 bg-neutral-950 p-6"
        >
          <div className="text-sm text-white/70">Step 2</div>
          <h3 className="mt-1 font-inter text-lg font-semibold text-white">
            Daily lesson & conversation
          </h3>
          <p className="mt-1 text-[var(--color-text-secondary)]">
            Short, AI‑guided sessions and real practice.
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/40 overflow-hidden">
            <Image
              src="/conversations.png"
              alt="Conversations"
              width={560}
              height={360}
              className="w-full h-auto object-cover"
            />
          </div>
        </motion.div>
        <motion.div
          {...inView(0.06, 0.7)}
          className="group rounded-2xl border border-white/10 bg-neutral-950 p-6"
        >
          <div className="text-sm text-white/70">Step 3</div>
          <h3 className="mt-1 font-inter text-lg font-semibold text-white">
            Review with SRS
          </h3>
          <p className="mt-1 text-[var(--color-text-secondary)]">
            Remember more with smart flashcards.
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/40 overflow-hidden">
            <Image
              src="/flashcards.png"
              alt="Flashcards"
              width={560}
              height={360}
              className="w-full h-auto object-cover"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function ProofRibbon() {
  const prefersReducedMotion = useReducedMotion();
  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { y: 16, opacity: 0 },
        whileInView: { y: 0, opacity: 1 },
        viewport: { once: true, amount: 0.5 },
        transition: { duration: 0.6, ease },
      };

  return (
    <section className="max-w-6xl mx-auto px-4 py-10 md:py-14">
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide py-4">
        {[
          "/dashboard.png",
          "/placement_test.png",
          "/lessons.png",
          "/lessons_viewer_story.png",
          "/lessons_viewer_dialogue.png",
          "/flashcards.png",
          "/conversations.png",
          "/Popup_info_and_addtoflashcard.png",
        ].map((src) => (
          <div
            key={src}
            className="snap-start shrink-0 w-[280px] h-[180px] rounded-xl border border-white/10 bg-neutral-950 overflow-hidden hover:border-white/20 transition-colors"
          >
            <Image
              src={src}
              alt={src}
              width={560}
              height={360}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
      <motion.blockquote
        {...motionProps}
        className="mt-10 border-l-2 border-white/20 pl-4 text-white/90 max-w-3xl"
      >
        “Mandareen made daily Mandarin finally stick. Ten minutes a day, real
        progress.”
        <footer className="mt-2 text-[var(--color-text-secondary)]">
          — A happy learner
        </footer>
      </motion.blockquote>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="border-y border-white/10 bg-neutral-980/40 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:items-center">
        <div className="md:col-span-2">
          <h3 className="font-inter text-2xl md:text-3xl font-semibold text-white">
            Start your Mandarin story today
          </h3>
          <p className="text-[var(--color-text-secondary)] mt-2 font-inter">
            Sign up free. Take a quick placement and begin your first lesson.
          </p>
        </div>
        <div className="flex md:justify-end gap-3">
          <Link
            href="/pricing"
            className="px-5 py-3 rounded-full bg-white text-black hover:bg-white/90 font-inter font-medium border border-white/10 transition-all duration-200 min-h-[44px] inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="View pricing plans"
          >
            View plans
          </Link>
          <Link
            href="/signup"
            className="px-5 py-3 rounded-full border border-white/10 text-white hover:bg-white/10 font-inter font-medium transition-all duration-200 min-h-[44px] inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="Sign up for free"
          >
            Sign up
          </Link>
        </div>
      </div>
    </section>
  );
}
