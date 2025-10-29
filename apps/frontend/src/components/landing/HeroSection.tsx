"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

export function HeroSection() {
  const [videoOk, setVideoOk] = useState(true);
  const prefersReducedMotion = useReducedMotion();
  const ease = [0.2, 0.8, 0.2, 1] as const;

  return (
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
        style={prefersReducedMotion ? undefined : { opacity: 0.2 }}
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
            A focused path that blends AI‑guided lessons, real conversation, and
            reviews that stick.
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
              href="/signup"
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
  );
}
