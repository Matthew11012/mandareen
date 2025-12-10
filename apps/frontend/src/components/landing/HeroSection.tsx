"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/hooks/use-auth";
import { ArrowRight, Play } from "lucide-react";
import { useState, useEffect } from "react";

function HeroFlashcard() {
  const [flipped, setFlipped] = useState(false);

  // Auto flip effect every few seconds to attract attention if not interacted with
  useEffect(() => {
    const timer = setInterval(() => {
      setFlipped((prev) => !prev);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="relative w-full max-w-sm mx-auto aspect-[3/4] [perspective:1000px] group cursor-pointer"
      onClick={() => setFlipped(!flipped)}
    >
      <motion.div
        className="w-full h-full relative [transform-style:preserve-3d] transition-all duration-700 ease-out shadow-ink"
        animate={{ rotateY: flipped ? 180 : 0 }}
      >
        {/* Front Face (Hanzi) */}
        <div className="absolute inset-0 [backface-visibility:hidden] bg-[#2e323a] border border-[#404040] rounded-2xl flex flex-col items-center justify-center p-8 shadow-2xl">
          <div className="absolute top-4 right-4 text-xs font-mono border border-[#35503c] bg-[#26322b] text-[#4ade80] px-2 py-1 rounded">
            HSK 1
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <h2 className="text-8xl font-serif-zh font-bold text-white mb-6">
              你好
            </h2>
            <div className="h-1 w-12 bg-[#4040f2] rounded-full" />
          </div>
          <div className="text-[#a6a6a6] text-sm animate-pulse">
            Tap to flip
          </div>
        </div>

        {/* Back Face (Details) */}
        <div className="absolute inset-0 [backface-visibility:hidden] bg-[#2e323a] border border-[#4040f2] rounded-2xl flex flex-col items-center justify-center p-8 shadow-2xl [transform:rotateY(180deg)]">
          <div className="absolute top-4 right-4 text-xs font-mono border border-[#35503c] bg-[#26322b] text-[#4ade80] px-2 py-1 rounded">
            HSK 1
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-3xl text-[#c6ceff] font-medium mb-2">
              Nǐ Hǎo
            </div>
            <div className="text-3xl text-[#a6a6a6] mb-8">👋 Hello</div>
          </div>

          <div className="w-full grid grid-cols-4 gap-2 mt-auto pt-4 border-t border-[#404040]">
            {[0, 1, 3, 5].map((q) => (
              <div
                key={q}
                className={`h-2 rounded-full ${q === 5 ? "bg-green-500" : "bg-[#3a3e46]"}`}
              />
            ))}
          </div>
        </div>
      </motion.div>

      {/* Decorative background elements behind the card */}
      <div className="absolute -inset-4 bg-gradient-to-tr from-[#4040f2]/20 to-transparent blur-2xl -z-10 rounded-full opacity-50" />
    </div>
  );
}

function PolyglotTooltip({
  children,
  text,
  pinyin,
}: {
  children: React.ReactNode;
  text: string;
  pinyin: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative inline-block cursor-help decoration-dashed underline decoration-white/30 hover:decoration-[#4040f2] hover:text-white transition-all"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={() => setIsOpen(!isOpen)}
      role="button"
      tabIndex={0}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {children}
      <div
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1d2128] border border-[#3a3f48] rounded-lg shadow-xl transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="text-center">
          <div className="text-[#c6ceff] text-sm font-medium">{pinyin}</div>
          <div className="text-white text-sm font-serif-zh">{text}</div>
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#3a3f48]" />
      </div>
    </div>
  );
}

export function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const ease = [0.2, 0.8, 0.2, 1] as const;

  const fadeIn = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { y: 20, opacity: 0 },
          animate: { y: 0, opacity: 1 },
          transition: { duration: 0.8, ease, delay },
        };

  return (
    <section className="relative w-full pt-32 pb-20 px-4 md:pt-40 md:pb-32 overflow-hidden">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-16 items-center">
        {/* Text Content */}
        <div className="flex-1 text-center md:text-left z-10">
          <motion.div
            {...fadeIn(0)}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-[var(--color-text-secondary)] mb-6 shadow-ink"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI-Powered Mandarin Learning</span>
          </motion.div>

          <motion.h1
            {...fadeIn(0.1)}
            className="font-inter font-bold text-5xl md:text-7xl leading-[1.1] tracking-tight text-white mb-6"
          >
            Reach your next <br className="hidden md:block" />
            <span>
              <PolyglotTooltip text="水平" pinyin="shuǐ píng">
                Level
              </PolyglotTooltip>
              .
            </span>
          </motion.h1>

          <motion.p
            {...fadeIn(0.2)}
            className="text-[var(--color-text-secondary)] text-lg md:text-xl leading-relaxed max-w-xl mx-auto md:mx-0 mb-8"
          >
            Placement in{" "}
            <PolyglotTooltip text="分钟" pinyin="fēnzhōng">
              minutes
            </PolyglotTooltip>
            . Lessons and conversations tuned to your level. Spaced reviews that
            make vocab stick.
          </motion.p>

          <motion.div
            {...fadeIn(0.3)}
            className="flex items-center gap-4 justify-center md:justify-start"
          >
            {!authLoading && isAuthenticated ? (
              <Link
                href="/dashboard"
                className="group relative px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-neutral-200 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : (
              <>
                <Link
                  href="/assessment"
                  className="group relative px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-neutral-200 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                >
                  Start Placement Test
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/lessons"
                  className="px-6 py-3 rounded-full border border-white/10 hover:bg-white/5 text-white font-medium transition-all flex items-center gap-2 hover:border-white/30"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Try a Lesson 
                </Link>
              </>
            )}
          </motion.div>

          <motion.div
            {...fadeIn(0.4)}
            className="mt-8 flex items-center gap-4 justify-center md:justify-start text-sm text-[var(--color-text-secondary)]"
          >
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-neutral-800 border border-black flex items-center justify-center text-xs text-white/40 ring-2 ring-[#20242b]"
                >
                  U{i}
                </div>
              ))}
            </div>
            <div>
              <span className="text-white font-semibold">2,000+</span> learners
              placed
            </div>
          </motion.div>
        </div>

        {/* Hero Interactive Visual */}
        <motion.div
          {...fadeIn(0.4)}
          className="flex-1 w-full max-w-[500px] relative"
        >
          <HeroFlashcard />
        </motion.div>
      </div>
    </section>
  );
}
