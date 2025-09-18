"use client";

import Link from "next/link";
import { ChevronDown, Sparkles, MessageSquare, BookOpen } from "lucide-react";
import { useState } from "react";

export default function LandingPage() {
  const [open, setOpen] = useState<number | null>(0);
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
    <main className="min-h-screen bg-[var(--color-primary-bg)] text-[var(--color-text-primary)]">
      {/* Header */}
      <header className="sticky top-4 z-40">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between rounded-4xl border border-[var(--color-surface-2)]/60 bg-[rgba(26,29,35,0.55)] backdrop-blur-xs pr-4 pl-8 py-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center">
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
                className="px-4 py-2 rounded-full bg-[var(--color-accent-blue)] hover:opacity-90 text-white font-inter"
              >
                Get Started
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <h1 className="font-inter font-extrabold text-4xl md:text-5xl leading-tight max-w-3xl">
          Learn Mandarin with clarity — AI-guided, distraction-free
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-4 max-w-2xl font-inter">
          Short sessions that stick: lessons, conversations, and reviews in one
          minimal workspace.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/auth?mode=signup"
            className="px-5 py-3 rounded-full bg-[var(--color-accent-blue)] hover:opacity-90 text-white font-inter"
          >
            Get Started
          </Link>
          <Link
            href="/auth"
            className="text-[var(--color-text-secondary)] hover:text-white font-inter"
          >
            I already have an account
          </Link>
        </div>
      </section>

      {/* Feature summary (engaging, minimalist) */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="group rounded-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] p-6 transition-all duration-300 hover:border-[var(--color-accent-blue)]/60 hover:shadow-[0_10px_30px_rgba(64,64,242,0.15)] hover:-translate-y-0.5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4040f2] to-[#6366f1] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h3 className="mt-4 font-inter text-lg font-semibold text-white">
              AI‑crafted lessons
            </h3>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              Short, adaptive sessions tailored to your level.
            </p>
          </div>

          <div className="group rounded-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] p-6 transition-all duration-300 hover:border-[var(--color-accent-blue)]/60 hover:shadow-[0_10px_30px_rgba(64,64,242,0.15)] hover:-translate-y-0.5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4040f2] to-[#6366f1] flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h3 className="mt-4 font-inter text-lg font-semibold text-white">
              Real conversation
            </h3>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              Practice speaking with instant, friendly feedback.
            </p>
          </div>

          <div className="group rounded-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] p-6 transition-all duration-300 hover:border-[var(--color-accent-blue)]/60 hover:shadow-[0_10px_30px_rgba(64,64,242,0.15)] hover:-translate-y-0.5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4040f2] to-[#6366f1] flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h3 className="mt-4 font-inter text-lg font-semibold text-white">
              Review that sticks
            </h3>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              Built‑in spaced repetition to remember more.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits strip */}
      <section className="border-y border-[var(--color-surface-2)] bg-[var(--color-surface-1)]">
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-[var(--color-text-secondary)]">
          <div>Fast setup — start in 60 seconds</div>
          <div>Learn in short focused sessions</div>
          <div>Accessible on any device</div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-inter text-3xl font-bold mb-6">Pricing</h2>
        <p className="text-[var(--color-text-secondary)] mb-8">
          Simple, transparent plans. Start free and upgrade anytime.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] p-6">
            <h3 className="font-inter text-xl font-semibold">Free</h3>
            <p className="text-[var(--color-text-secondary)] mt-1">
              Get started
            </p>
            <div className="mt-4 text-3xl font-bold">
              $0
              <span className="text-base font-normal text-[var(--color-text-secondary)]">
                /mo
              </span>
            </div>
            <ul className="mt-6 space-y-2 text-[var(--color-text-secondary)]">
              <li>AI lessons (limited)</li>
              <li>Basic conversation practice</li>
              <li>Flashcards with SRS</li>
            </ul>
            <Link
              href="/auth?mode=signup"
              className="mt-6 inline-block px-4 py-2 rounded-lg bg-[var(--color-accent-blue)] text-white hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
          <div className="rounded-2xl border-2 border-[var(--color-accent-blue)] bg-[var(--color-surface-1)] p-6 shadow-[0_8px_24px_rgba(64,64,242,0.15)]">
            <h3 className="font-inter text-xl font-semibold">Pro</h3>
            <p className="text-[var(--color-text-secondary)] mt-1">
              Best for most
            </p>
            <div className="mt-4 text-3xl font-bold">
              $12
              <span className="text-base font-normal text-[var(--color-text-secondary)]">
                /mo
              </span>
            </div>
            <ul className="mt-6 space-y-2 text-[var(--color-text-secondary)]">
              <li>Unlimited AI lessons</li>
              <li>Advanced conversation coach</li>
              <li>Custom vocab packs</li>
              <li>Priority review scheduling</li>
            </ul>
            <Link
              href="/auth?mode=signup"
              className="mt-6 inline-block px-4 py-2 rounded-lg bg-[var(--color-accent-blue)] text-white hover:opacity-90"
            >
              Start Pro
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] p-6">
            <h3 className="font-inter text-xl font-semibold">Teams</h3>
            <p className="text-[var(--color-text-secondary)] mt-1">
              For classrooms & orgs
            </p>
            <div className="mt-4 text-3xl font-bold">
              $29
              <span className="text-base font-normal text-[var(--color-text-secondary)]">
                /mo
              </span>
            </div>
            <ul className="mt-6 space-y-2 text-[var(--color-text-secondary)]">
              <li>All Pro features</li>
              <li>Shared progress dashboard</li>
              <li>Admin controls</li>
              <li>Priority support</li>
            </ul>
            <Link
              href="/auth?mode=signup"
              className="mt-6 inline-block px-4 py-2 rounded-lg border border-[var(--color-surface-2)] text-white hover:bg-[var(--color-surface-2)]"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof (minimal) */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-[var(--color-text-secondary)]">
          Trusted by learners worldwide — join today.
        </p>
      </section>

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
