"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const ease = [0.2, 0.8, 0.2, 1] as const;

export function PricingSection() {
  const prefersReducedMotion = useReducedMotion();
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
        className="font-inter text-3xl md:text-4xl font-bold mb-8"
      >
        Pricing
      </motion.h2>
      <p className="text-[var(--color-text-secondary)] mb-10 max-w-2xl">
        Simple plans to get you speaking. Start free; upgrade anytime.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-stretch">
        <motion.div
          {...motionProps}
          className="rounded-2xl border border-white/10 bg-neutral-950 p-6 flex flex-col"
        >
          <div className="text-sm text-white/70">Free</div>
          <div className="mt-2">
            <span className="text-4xl font-bold text-white">$0</span>
            <span className="text-[var(--color-text-secondary)]">/mo</span>
          </div>
          <ul className="mt-4 space-y-2 text-[var(--color-text-secondary)]">
            <li>AI lessons (limited)</li>
            <li>Basic conversation practice</li>
            <li>Flashcards with SRS</li>
          </ul>
          <div className="mt-6 pt-2">
            <Link
              href="/signup"
              className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full border border-white/10 text-white hover:bg-white/10"
            >
              Get started
            </Link>
          </div>
        </motion.div>
        <motion.div
          {...motionProps}
          className="rounded-2xl border border-white/20 bg-black p-6 shadow-[0_8px_30px_rgba(0,0,0,0.35)] relative flex flex-col"
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white border border-white/20 backdrop-blur">
            Most popular
          </div>
          <div className="text-sm text-white">Pro</div>
          <div className="mt-2">
            <span className="text-4xl font-bold text-white">$12</span>
            <span className="text-[var(--color-text-secondary)]">/mo</span>
          </div>
          <ul className="mt-4 space-y-2 text-[var(--color-text-secondary)]">
            <li>Unlimited AI lessons</li>
            <li>Advanced conversation coach</li>
            <li>Custom vocab packs</li>
          </ul>
          <div className="mt-6 pt-2">
            <Link
              href="/signup"
              className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 border border-white/10"
            >
              Start Pro
            </Link>
          </div>
        </motion.div>
        <motion.div
          {...motionProps}
          className="rounded-2xl border border-white/10 bg-neutral-950 p-6 flex flex-col"
        >
          <div className="text-sm text-white/70">Teams</div>
          <div className="mt-2">
            <span className="text-4xl font-bold text-white">$29</span>
            <span className="text-[var(--color-text-secondary)]">/mo</span>
          </div>
          <ul className="mt-4 space-y-2 text-[var(--color-text-secondary)]">
            <li>All Pro features</li>
            <li>Shared progress dashboard</li>
            <li>Admin controls & priority support</li>
          </ul>
          <div className="mt-6 pt-2">
            <Link
              href="/signup"
              className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full border border-white/10 text-white hover:bg-white/10"
            >
              Contact sales
            </Link>
          </div>
        </motion.div>
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
          <p className="text-[var(--color-text-secondary)] mt-2">
            Sign up free. Take a quick placement and begin your first lesson.
          </p>
        </div>
        <div className="flex md:justify-end">
          <Link
            href="/signup"
            className="px-5 py-3 rounded-full bg-white text-black hover:bg-white/90 font-inter border border-white/10"
          >
            Sign up
          </Link>
        </div>
      </div>
    </section>
  );
}
