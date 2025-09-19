"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Sparkles, MessageSquare, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const [open, setOpen] = useState<number | null>(0);
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
  const [heroSlide, setHeroSlide] = useState(0);
  const goToSlide = (index: number) => {
    const total = screenshots.length;
    setHeroSlide(((index % total) + total) % total);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setHeroSlide((prev) => (prev + 1) % screenshots.length);
      } else if (e.key === "ArrowLeft") {
        setHeroSlide(
          (prev) => (prev - 1 + screenshots.length) % screenshots.length
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screenshots.length]);
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
          <div className="flex items-center justify-between rounded-4xl bg-white/2.5 border border-white/50 backdrop-blur-sm before:absolute before:inset-0 before:rounded-full before:from-white/60 before:via-transparent before:to-transparent before:opacity-70 before:pointer-events-none transition antialiased pr-4 pl-8 py-3">
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
        <div className="grid grid-cols-1 md:grid-cols-2 items-center">
          <div>
            <h1 className="font-inter font-extrabold text-4xl md:text-5xl leading-tight max-w-3xl">
              Learn Mandarin with clarity — AI-guided, distraction-free
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-4 max-w-2xl font-inter">
              Short sessions that stick: lessons, conversations, and reviews in
              one minimal workspace.
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
          </div>
          <div>
            <div className="relative rounded-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
              <div className="relative h-64 md:h-80">
                <div
                  className="flex h-full w-full transition-transform duration-500 ease-[var(--motion-ease)]"
                  style={{ transform: `translateX(-${heroSlide * 100}%)` }}
                  aria-live="polite"
                >
                  {screenshots.map((s, idx) => (
                    <div
                      key={idx}
                      className="min-w-full h-full relative select-none"
                    >
                      <Image
                        src={s.src}
                        alt={s.alt}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                        priority={idx === 0}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <span className="inline-flex items-center px-2 py-1 text-[10px] md:text-xs rounded-full text-white/90 bg-black/35 backdrop-blur-sm border border-white/10">
                          {s.caption}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  aria-label="Previous screenshot"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white grid place-items-center border border-white/10 cursor-pointer"
                  onClick={() => goToSlide(heroSlide - 1)}
                >
                  <span className="sr-only">Previous</span>‹  
                </button>
                <button
                  aria-label="Next screenshot"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white grid place-items-center border border-white/10 cursor-pointer"
                  onClick={() => goToSlide(heroSlide + 1)}
                >
                  <span className="sr-only">Next</span>›
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 py-3">
                {screenshots.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`Go to screenshot ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      heroSlide === i
                        ? "w-6 bg-[var(--color-accent-blue)]"
                        : "w-2 bg-white/30 hover:bg-white/50"
                    }`}
                    onClick={() => goToSlide(i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature summary */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-center">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-center">
          <div className="w-full h-fit rounded-lg border shadow-sm overflow-hidden bg-[var(--color-surface-1)] border-[var(--color-surface-2)] shadow-black/5 ">
            <div className="p-6 text-center border-b border-[var(--color-surface-2)]">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-secondary-bg)] text-white border border-[var(--color-secondary-bg)]">
                Free Plan
              </div>
              <div className="mt-4">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-[var(--color-text-secondary)]">
                  /month
                </span>
              </div>
              <p className="text-[var(--color-text-secondary)] text-sm mt-2">
                Get started
              </p>
            </div>
            <div className="p-6">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    AI lessons (limited)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Basic conversation practice
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Flashcards with SRS
                  </span>
                </li>
              </ul>
            </div>
            <div className="p-6 pt-0">
              <Link
                href="/auth?mode=signup"
                className="w-full inline-flex items-center justify-center border align-middle select-none font-sans font-medium text-center duration-300 ease-in disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed focus:shadow-none text-sm py-2 px-4 shadow-sm hover:shadow-md bg-transparent border-[var(--color-surface-2)] text-white rounded-lg hover:bg-[var(--color-surface-2)]"
              >
                Get Started
              </Link>
            </div>
          </div>

          {/* Pro Card (highlighted) */}
          <div className="w-full rounded-lg border-2 shadow-sm overflow-visible bg-[var(--color-surface-1)] border-[var(--color-accent-blue)] shadow-[0_8px_24px_rgba(64,64,242,0.15)] relative md:min-h-[520px]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-accent-blue)] text-white border border-[var(--color-accent-blue)] shadow-sm">
              Most Popular
            </div>
            <div className="p-8 text-center border-b border-[var(--color-surface-2)]">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-accent-blue)] text-white border border-[var(--color-accent-blue)]">
                Pro Plan
              </div>
              <div className="mt-4">
                <span className="text-4xl font-bold text-white">$12</span>
                <span className="text-[var(--color-text-secondary)]">
                  /month
                </span>
              </div>
              <p className="text-[var(--color-text-secondary)] text-sm mt-2">
                Best for most
              </p>
            </div>
            <div className="p-8">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Unlimited AI lessons
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Advanced conversation coach
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Custom vocab packs
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Priority review scheduling
                  </span>
                </li>
              </ul>
            </div>
            <div className="p-8 pt-0">
              <Link
                href="/auth?mode=signup"
                className="w-full inline-flex items-center justify-center border align-middle select-none font-sans font-medium text-center duration-300 ease-in disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed focus:shadow-none text-sm py-2 px-4 shadow-sm hover:shadow-md bg-[var(--color-accent-blue)] text-white rounded-lg"
              >
                Start Pro
              </Link>
            </div>
          </div>

          {/* Teams Card */}
          <div className="w-full h-fit rounded-lg border shadow-sm overflow-hidden bg-[var(--color-surface-1)] border-[var(--color-surface-2)] shadow-black/5">
            <div className="p-6 text-center border-b border-[var(--color-surface-2)]">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#15803d] text-white border border-[#15803d]">
                Teams Plan
              </div>
              <div className="mt-4">
                <span className="text-4xl font-bold text-white">$29</span>
                <span className="text-[var(--color-text-secondary)]">
                  /month
                </span>
              </div>
              <p className="text-[var(--color-text-secondary)] text-sm mt-2">
                For classrooms & orgs
              </p>
            </div>
            <div className="p-6">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    All Pro features
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Shared progress dashboard
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Admin controls
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[var(--color-success)] mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    Priority support
                  </span>
                </li>
              </ul>
            </div>
            <div className="p-6 pt-0">
              <Link
                href="/auth?mode=signup"
                className="w-full inline-flex items-center justify-center border align-middle select-none font-sans font-medium text-center duration-300 ease-in disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed focus:shadow-none text-sm py-2 px-4 shadow-sm hover:shadow-md bg-[#15803d] border-[#15803d] text-white rounded-lg hover:bg-[#166534]"
              >
                Contact Sales
              </Link>
            </div>
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
