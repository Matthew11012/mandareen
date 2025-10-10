"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";

export default function LandingPage() {
  const [open, setOpen] = useState<number | null>(0);
  const [videoOk, setVideoOk] = useState(true);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const depthScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const depthOpacity = useTransform(scrollYProgress, [0, 1], [0.2, 0.5]);
  const gridOpacity = useTransform(scrollYProgress, [0, 1], [0.06, 0.16]);
  const ease = [0.2, 0.8, 0.2, 1] as const;
  const inViewProps = (delay = 0, duration = 0.6) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { y: 12, opacity: 0 },
          whileInView: { y: 0, opacity: 1 },
          viewport: { once: true, amount: 0.6 },
          transition: { duration, ease, delay },
        };
  const screenshots: { src: string; alt: string; caption: string }[] = [
    { src: "/dashboard.png", alt: "Dashboard", caption: "Dashboard overview" },
    {
      src: "/placement_test.png",
      alt: "Placement test",
      caption: "Adaptive placement test",
    },
    { src: "/lessons.png", alt: "Lessons", caption: "Lessons library" },
    {
      src: "/lessons_viewer_story.png",
      alt: "Story lesson",
      caption: "Story lesson viewer",
    },
    {
      src: "/lessons_viewer_dialogue.png",
      alt: "Dialogue lesson",
      caption: "Dialogue lesson viewer",
    },
    {
      src: "/flashcards.png",
      alt: "Flashcards",
      caption: "Spaced repetition flashcards",
    },
    {
      src: "/conversations.png",
      alt: "Conversations",
      caption: "AI conversation practice",
    },

    {
      src: "/Popup_info_and_addtoflashcard.png",
      alt: "Popup info",
      caption: "Quick add to flashcards",
    },
  ];
  // Storytelling revamp: remove previous keyboard-driven hero carousel logic
  const faqs = [
    {
      q: "How does Mandareen help me learn?",
      a: "AI generates lessons and conversations tailored to your level, and you review with spaced repetition.",
    },
    {
      q: "Is it free to start?",
      a: "Yes. You can create an account and start learning for free.",
    },
    {
      q: "Can I practice speaking?",
      a: "Yes. Talk to the AI partner and get real-time feedback and tips.",
    },
  ];

  return (
    <main className="min-h-screen bg-black text-[var(--color-text-primary)]">
      {/* Background layers: vignette + grid + noise; deepen on scroll */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={
          prefersReducedMotion
            ? undefined
            : { scale: depthScale, opacity: depthOpacity }
        }
      >
        {/* Radial vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(255,255,255,0.08),transparent_60%)]" />
        {/* Soft grid */}
        <motion.div
          className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_60%)]"
          style={prefersReducedMotion ? undefined : { opacity: gridOpacity }}
        />
        {/* Noise overlay */}
        <div
          className="absolute inset-0 opacity-20 [background-image:url('data:image/svg+xml;utf8,\
          <svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'>\
            <filter id=\'n\'>\
              <feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/>\
              <feColorMatrix type=\'saturate\' values=\'0\'/>\
            </filter>\
            <rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\' opacity=\'0.25\'/>\
          </svg>')] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        />
      </motion.div>
      {/* Header */}
      <header className="sticky top-4 z-40">
        <div className="max-w-6xl mx-auto px-4">
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex items-center justify-between rounded-4xl border border-white/10 bg-black/40 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)] pr-4 pl-8 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center border border-white/10">
                <span className="text-white font-bold">普</span>
              </div>
              <span className="font-inter font-semibold">Mandareen</span>
            </div>
            <nav className="flex items-center gap-6">
              <a
                href="#features"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                Pricing
              </a>
              <a
                href="#faq"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                FAQ
              </a>
              <Link
                href="/auth"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                Login
              </Link>
              <Link
                href="/auth?mode=signup"
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-inter border border-white/10 backdrop-blur"
              >
                Sign up
              </Link>
            </nav>
          </motion.div>
        </div>
      </header>
      {/* Cinematic hero */}
      <section className="relative h-[80vh] md:h-[88vh] w-full overflow-hidden">
        {!prefersReducedMotion && videoOk ? (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src="/hero-bg.mp4"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoOk(false)}
          />
        ) : (
          <Image
            src="/lessons_viewer_story.png"
            alt="Learning hero"
            fill
            className="object-cover"
            priority
          />
        )}
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={prefersReducedMotion ? undefined : { opacity: depthOpacity }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(0,0,0,0),rgba(0,0,0,0.6)_60%)]" />
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />
        </motion.div>
        <div className="relative z-10 h-full max-w-6xl mx-auto px-4 flex flex-col items-start justify-end pb-12">
          <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-[2px] p-6 md:p-8 max-w-3xl md:bg-black/35">
            <motion.h1
              {...(prefersReducedMotion
                ? {}
                : {
                    initial: { y: 24, opacity: 0 },
                    animate: { y: 0, opacity: 1 },
                    transition: { duration: 0.8, ease },
                  })}
              className="font-inter font-extrabold text-4xl md:text-6xl leading-tight tracking-tight"
            >
              Find your voice in Mandarin
            </motion.h1>
            <motion.p
              {...(prefersReducedMotion
                ? {}
                : {
                    initial: { y: 24, opacity: 0 },
                    animate: { y: 0, opacity: 1 },
                    transition: { duration: 0.9, ease, delay: 0.05 },
                  })}
              className="text-[var(--color-text-secondary)] mt-4 font-inter"
            >
              A focused path that blends AI‑guided lessons, real conversation,
              and reviews that stick.
            </motion.p>
            <motion.div
              {...(prefersReducedMotion
                ? {}
                : {
                    initial: { y: 24, opacity: 0 },
                    animate: { y: 0, opacity: 1 },
                    transition: { duration: 1, ease, delay: 0.1 },
                  })}
              className="mt-8 flex items-center gap-3"
            >
              <Link
                href="/auth?mode=signup"
                className="px-5 py-3 rounded-full bg-white text-black hover:bg-white/90 font-inter border border-white/10"
              >
                Sign up
              </Link>
              <Link
                href="/assessment"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                Take placement test
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <motion.h2
          {...inViewProps(0, 0.6)}
          className="font-inter text-3xl md:text-4xl font-bold mb-8"
        >
          Pricing
        </motion.h2>
        <p className="text-[var(--color-text-secondary)] mb-10 max-w-2xl">
          Simple plans to get you speaking. Start free; upgrade anytime.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-stretch">
          {/* Free */}
          <motion.div
            {...inViewProps(0, 0.5)}
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
                href="/auth?mode=signup"
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full border border-white/10 text-white hover:bg-white/10"
              >
                Get started
              </Link>
            </div>
          </motion.div>

          {/* Pro */}
          <motion.div
            {...inViewProps(0.03, 0.6)}
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
                href="/auth?mode=signup"
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 border border-white/10"
              >
                Start Pro
              </Link>
            </div>
          </motion.div>

          {/* Teams */}
          <motion.div
            {...inViewProps(0.06, 0.7)}
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
                href="/auth?mode=signup"
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full border border-white/10 text-white hover:bg-white/10"
              >
                Contact sales
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem → Solution narrative */}
      <section className="max-w-6xl mx-auto px-4 py-20 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-10">
          <motion.div {...inViewProps(0, 0.6)}>
            <h2 className="font-inter text-3xl md:text-4xl font-bold">
              The problem
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 max-w-xl">
              Learning Mandarin can feel overwhelming—too many paths, not enough
              focus. Distraction breaks momentum.
            </p>
          </motion.div>
          <motion.div {...inViewProps(0.05, 0.7)}>
            <h2 className="font-inter text-3xl md:text-4xl font-bold">
              Our approach
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 max-w-xl">
              Mandareen gives you a guided path: a quick placement, short
              AI‑guided lessons, real conversations, and reviews that stick.
            </p>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-start">
          <motion.div
            {...inViewProps(0, 0.5)}
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
            {...inViewProps(0.03, 0.6)}
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
            {...inViewProps(0.06, 0.7)}
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

      {/* Proof ribbon + testimonial */}
      <section className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide py-4">
          {screenshots.map((s) => (
            <div
              key={s.src}
              className="snap-start shrink-0 w-[280px] h-[180px] rounded-xl border border-white/10 bg-neutral-950 overflow-hidden hover:border-white/20 transition-colors"
            >
              <Image
                src={s.src}
                alt={s.alt}
                width={560}
                height={360}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
        <motion.blockquote
          {...(prefersReducedMotion
            ? {}
            : {
                initial: { y: 16, opacity: 0 },
                whileInView: { y: 0, opacity: 1 },
                viewport: { once: true, amount: 0.5 },
                transition: { duration: 0.6, ease },
              })}
          className="mt-10 border-l-2 border-white/20 pl-4 text-white/90 max-w-3xl"
        >
          “Mandareen made daily Mandarin finally stick. Ten minutes a day, real
          progress.”
          <footer className="mt-2 text-[var(--color-text-secondary)]">
            — A happy learner
          </footer>
        </motion.blockquote>
      </section>

      {/* Final CTA band */}
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
              href="/auth?mode=signup"
              className="px-5 py-3 rounded-full bg-white text-black hover:bg-white/90 font-inter border border-white/10"
            >
              Sign up
            </Link>
          </div>
        </div>
      </section>

      {/* Proof strip removed in favor of ribbon above */}

      {/* FAQ (compact accordion) */}
      <section id="faq" className="max-w-3xl mx-auto px-4 py-10">
        <h2 className="font-inter text-2xl font-semibold mb-4">FAQ</h2>
        <div className="divide-y divide-[var(--color-surface-2)]">
          {faqs.map((f, idx) => (
            <button
              key={idx}
              className="w-full text-left py-4 focus:outline-none cursor-pointer"
              onClick={() => setOpen(open === idx ? null : idx)}
              aria-expanded={open === idx}
            >
              <div className="flex items-center justify-between">
                <span className="font-inter">{f.q}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${open === idx ? "rotate-180" : ""}`}
                />
              </div>
              <div
                className={`grid transition-all duration-300 ease-[var(--motion-ease)] ${open === idx ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"}`}
              >
                <div className="overflow-hidden">
                  <p className="mt-2 text-[var(--color-text-secondary)]">
                    {f.a}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 text-[var(--color-text-secondary)]">
        <div className="flex items-center justify-between">
          <span className="font-inter">
            © {new Date().getFullYear()} Mandareen
          </span>
          <div className="flex items-center gap-4">
            <Link href="/auth" className="hover:text-white">
              Login
            </Link>
            <Link href="/auth?mode=signup" className="hover:text-white">
              Get Started
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
