"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import {
  Book,
  Mic,
  BrainCircuit,
  GraduationCap,
  Search,
  Layout,
  Volume2,
  Check,
  MousePointer2,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

// ------- Static data & paths hoisted for reuse ------- //
const USER_MSG = {
  hanzi: "今天怎么样？",
  pinyin: "jīn tiān zěn me yàng ?",
  translation: "How is today?",
};

const AI_MSG = {
  hanzi: "我很好，谢谢！你呢？",
  pinyin: "wǒ hěn hǎo , xiè xie ! nǐ ne ?",
  translation: "I'm very good, thanks! And you?",
  tokens: [
    { t: "我", p: "wǒ" },
    { t: "很好", p: "hěn hǎo" },
    { t: "，", p: "" },
    { t: "谢谢", p: "xiè xie" },
    { t: "！", p: "" },
    { t: "你", p: "nǐ" },
    { t: "呢", p: "ne" },
    { t: "？", p: "" },
  ],
};

const WAVE_BARS = Array.from({ length: 16 }, (_, i) => i);

const FLASHCARDS = [
  {
    hanzi: "中文",
    pinyin: "zhōng wén",
    definition: "Chinese language",
    hsk: 1,
  },
  {
    hanzi: "学习",
    pinyin: "xué xí",
    definition: "to learn / to study",
    hsk: 1,
  },
];

const PROGRESS_STEPS = [
  { label: "Day 1", newWords: 120, learned: 80 },
  { label: "Day 7", newWords: 420, learned: 280 },
  { label: "Day 14", newWords: 820, learned: 560 },
  { label: "Day 30", newWords: 1240, learned: 850 },
];

const PROGRESS_NEW_PATHS = [
  "M0,50 L0,44 C20,43 40,42 60,41 C80,40 100,39 100,38 L100,50 Z",
  "M0,50 L0,38 C20,36 40,34 60,32 C80,31 100,29 100,27 L100,50 Z",
  "M0,50 L0,32 C20,29 40,25 60,22 C80,20 100,18 100,16 L100,50 Z",
  "M0,50 L0,28 C20,21 40,14 60,9 C80,5 100,2 100,0 L100,50 Z",
];

const PROGRESS_NEW_TOP_PATHS = [
  "M0,44 C20,43 40,42 60,41 C80,40 100,39 100,38",
  "M0,38 C20,36 40,34 60,32 C80,31 100,29 100,27",
  "M0,32 C20,29 40,25 60,22 C80,20 100,18 100,16",
  "M0,28 C20,21 40,14 60,9 C80,5 100,2 100,0",
];

const PROGRESS_LEARNED_PATHS = [
  "M0,50 L0,48 C20,47 40,46 60,45 C80,44 100,43 100,42 L100,50 Z",
  "M0,50 L0,44 C20,43 40,42 60,40 C80,38 100,36 100,34 L100,50 Z",
  "M0,50 L0,38 C20,36 40,34 60,31 C80,28 100,26 100,24 L100,50 Z",
  "M0,50 L0,40 C20,35 40,30 60,25 C80,20 100,14 100,10 L100,50 Z",
];

const PROGRESS_LEARNED_TOP_PATHS = [
  "M0,48 C20,47 40,46 60,45 C80,44 100,43 100,42",
  "M0,44 C20,43 40,42 60,40 C80,38 100,36 100,34",
  "M0,38 C20,36 40,34 60,31 C80,28 100,26 100,24",
  "M0,40 C20,35 40,30 60,25 C80,20 100,14 100,10",
];

const usePageVisible = () => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === "visible");
    handler();
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
};

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  className?: string;
  visualClassName?: string;
  renderVisual?: () => React.ReactNode;
}

function FeatureCard({
  title,
  description,
  icon: Icon,
  className = "",
  visualClassName = "",
  renderVisual,
}: FeatureCardProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      className={`rounded-3xl border border-white/10 bg-neutral-900/50 p-8 overflow-hidden relative group ${className}`}
      onMouseMove={handleMouseMove}
    >
      {/* Spotlight Effect */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              rgba(64, 64, 242, 0.15),
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative z-10 h-full flex flex-col">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-ink">
          <Icon className="w-6 h-6 text-white/80" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3 font-inter">
          {title}
        </h3>
        <p className="text-[var(--color-text-secondary)] leading-relaxed max-w-sm mb-8">
          {description}
        </p>

        {/* Visual Area */}
        <div
          className={`mt-auto relative w-full h-64 rounded-xl bg-[#20242b] border border-white/5 overflow-hidden shadow-inner group-hover:border-[#4040f2]/30 transition-colors duration-500 ${visualClassName}`}
        >
          {renderVisual && renderVisual()}
        </div>
      </div>
    </div>
  );
}

// Visual Components mimicking App UI

const ConversationVisual = () => {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(containerRef, { amount: 0.3, margin: "-10% 0px" });
  const pageVisible = usePageVisible();
  const active = inView && pageVisible && !prefersReducedMotion;

  const [step, setStep] = useState<
    | "idle"
    | "recording"
    | "user_sent"
    | "ai_thinking"
    | "ai_streaming"
    | "ai_done"
  >("idle");
  const [streamIndex, setStreamIndex] = useState(0);

  // Loop the full conversation sequence forever
  useEffect(() => {
    if (!active) {
      setStep("idle");
      setStreamIndex(0);
      return;
    }

    let mounted = true;
    const wait = (ms: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    const loop = async () => {
      while (mounted) {
        setStep("idle");
        setStreamIndex(0);
        await wait(1000);

        setStep("recording");
        await wait(2000);

        setStep("user_sent");
        await wait(600);

        setStep("ai_thinking");
        await wait(800);

        setStep("ai_streaming");
        // Let streaming + result play out
        await wait(2200);

        setStep("ai_done");
        await wait(2500);
      }
    };

    loop();
    return () => {
      mounted = false;
    };
  }, [active]);

  // Streaming effect
  useEffect(() => {
    if (!active) return;
    if (step === "ai_streaming") {
      if (streamIndex < AI_MSG.tokens.length) {
        const timeout = setTimeout(() => {
          setStreamIndex((prev) => prev + 1);
        }, 150); // Typing speed
        return () => clearTimeout(timeout);
      }
    }
  }, [active, step, streamIndex]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#20242b] flex flex-col relative overflow-hidden font-inter text-sm"
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#20242b]/50 pointer-events-none" />

      {/* Messages Area */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden flex flex-col justify-end pb-24">
        {/* User Message */}
        <AnimatePresence>
          {(step === "user_sent" ||
            step === "ai_thinking" ||
            step === "ai_streaming" ||
            step === "ai_done") && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="ml-auto w-fit max-w-[85%]"
            >
              {/* User Bubble */}
              <div className="rounded-lg px-3 py-2 border border-[#3a3f47] bg-[#2e323a] text-white shadow-sm">
                <div className="leading-6">
                  {/* Simplified Token Renderer for User */}
                  <div className="flex flex-wrap gap-x-0.5 items-end">
                    {USER_MSG.hanzi.split("").map((char, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <div className="text-[10px] text-[#9aa6ff] leading-none mb-0.5 opacity-70">
                          {USER_MSG.pinyin.split(" ")[i] || ""}
                        </div>
                        <span>{char}</span>
                      </div>
                    ))}
                  </div>
                  {/* Translation */}
                  <div className="text-[#a6a6a6] text-xs mt-1 pt-1 border-t border-[#3a3f47]/50">
                    {USER_MSG.translation}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-[#808080] mt-1 text-right">
                Just now
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Message */}
        <AnimatePresence>
          {(step === "ai_thinking" ||
            step === "ai_streaming" ||
            step === "ai_done") && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mr-auto w-fit max-w-[85%]"
            >
              {/* Toggles Row */}
              <div className="mb-1 flex gap-2">
                {/* Audio */}
                <div className="px-2 py-1 text-[10px] rounded border border-[#4040f2] text-[#9aa6ff] flex items-center gap-1 bg-[#20242b] shadow-sm">
                  <Volume2 className="w-3 h-3" />
                </div>
                {/* Pinyin Toggle */}
                <div className="px-2 py-1 text-[10px] rounded border border-[#4040f2] text-[#9aa6ff] flex items-center gap-1 bg-[#20242b] shadow-sm">
                  <span>Pinyin On</span>
                </div>
                {/* Translation Toggle */}
                <div className="px-2 py-1 text-[10px] rounded border border-[#4040f2] text-[#9aa6ff] flex items-center gap-1 bg-[#20242b] shadow-sm">
                  <span className="font-bold">文</span>
                </div>
              </div>

              {/* AI Bubble */}
              <div className="rounded-lg px-3 py-2 border border-[#35503c] bg-[#26322b] text-white shadow-sm">
                {step === "ai_thinking" ? (
                  <div className="flex gap-1 h-6 items-center px-2">
                    <motion.div
                      className="w-1.5 h-1.5 bg-[#9aa6ff]"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
                      style={{ borderRadius: "50%" }}
                    />
                    <motion.div
                      className="w-1.5 h-1.5 bg-[#9aa6ff]"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: 0.2,
                      }}
                      style={{ borderRadius: "50%" }}
                    />
                    <motion.div
                      className="w-1.5 h-1.5 bg-[#9aa6ff]"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: 0.4,
                      }}
                      style={{ borderRadius: "50%" }}
                    />
                  </div>
                ) : (
                  <div className="leading-6">
                    {/* Streaming Tokens */}
                    <div className="flex flex-wrap gap-x-0.5 items-end">
                      {AI_MSG.tokens.slice(0, streamIndex).map((token, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center mr-0.5"
                        >
                          <span className="text-[10px] text-[#9aa6ff] leading-none mb-0.5">
                            {token.p}
                          </span>
                          <span>{token.t}</span>
                        </div>
                      ))}
                    </div>
                    {/* Translation (only show when some text exists) */}
                    {streamIndex > 2 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[#a6a6a6] text-xs mt-1 pt-1 border-t border-[#35503c]/50"
                      >
                        {AI_MSG.translation}
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-[#808080] mt-1">Just now</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area (Absolute Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#20242b] via-[#20242b] to-transparent pt-8 z-20">
        <div className="w-full flex justify-center">
          <AnimatePresence mode="wait">
            {step === "recording" ? (
              <motion.div
                key="recording"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex items-center min-h-[48px] w-[90%] md:w-[80%] bg-[#1a1d23] border border-[#2e323a] rounded-full px-4 h-12 shadow-lg"
              >
                {/* Fake Waveform */}
                <div className="flex-1 flex items-center justify-center gap-1 h-full overflow-hidden px-2">
                  {WAVE_BARS.map((_, i) => (
                    <div
                      key={i}
                      className="w-1 h-6 bg-[#4040f2] rounded-full animate-wave"
                      style={{ animationDelay: `${i * 0.06}s` }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 pl-3 border-l border-[#2e323a]">
                  <div className="p-1.5 rounded-full bg-[#2e323a] text-[#a6a6a6] border border-transparent">
                    <X className="w-4 h-4" />
                  </div>
                  <div className="p-1.5 rounded-full bg-[#2e323a] text-green-400 border border-green-500/40">
                    <Check className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-[90%] md:w-[80%] min-h-[48px] bg-[#1a1d23] border border-[#2e323a] rounded-full px-4 py-1.5 flex justify-between items-center gap-3 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
              >
                <span className="text-xs text-[#a6a6a6] ml-2">
                  Tap to speak...
                </span>
                <div className="w-8 h-8 rounded-full bg-[#4040f2] flex items-center justify-center text-white shadow-lg shadow-[#4040f2]/20">
                  <Mic className="w-4 h-4" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const FlashcardVisual = () => {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(containerRef, { amount: 0.3, margin: "-10% 0px" });
  const pageVisible = usePageVisible();
  const active = inView && pageVisible && !prefersReducedMotion;

  const [step, setStep] = useState<"front" | "revealed" | "graded">("front");
  const [cardIndex, setCardIndex] = useState(0);

  const currentCard = FLASHCARDS[cardIndex % FLASHCARDS.length];

  useEffect(() => {
    if (!active) {
      setStep("front");
      setCardIndex(0);
      return;
    }

    let mounted = true;

    const wait = (ms: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    const runSequence = async () => {
      if (step === "front") {
        // Wait then reveal
        await wait(1500);
        if (mounted) setStep("revealed");
      } else if (step === "revealed") {
        // Wait then grade
        await wait(1500);
        if (mounted) setStep("graded");
      } else if (step === "graded") {
        // Wait then next card
        await wait(800);
        if (mounted) {
          setStep("front");
          setCardIndex((prev) => prev + 1);
        }
      }
    };

    runSequence();
    return () => {
      mounted = false;
    };
  }, [active, step]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#20242b] p-4 flex items-center justify-center relative overflow-hidden font-inter"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={cardIndex}
          initial={{ opacity: 0, scale: 0.9, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{
            opacity: 0,
            scale: 0.9,
            x: -20,
            transition: { duration: 0.2 },
          }}
          className="w-full max-w-[240px] bg-[#2e323a] rounded-xl p-4 border border-[#404040] shadow-xl relative z-10 origin-center"
        >
          {/* Progress Bar Mock */}
          <div className="flex justify-between text-[10px] text-[#a6a6a6] mb-1.5">
            <span>Card {1} of 10</span>
            <span>9 remaining</span>
          </div>
          <div className="h-1 bg-[#1f2329] rounded mb-3 overflow-hidden">
            <motion.div
              className="h-full bg-[#4040f2]"
              initial={{ width: "0%" }}
              animate={{ width: "10%" }}
            />
          </div>

          {/* Card Content */}
          <div className="flex justify-between items-start mb-3">
            <h4 className="text-2xl text-white font-medium">
              {currentCard.hanzi}
            </h4>
            <div className="flex flex-col gap-1">
              <div
                className={`px-1.5 py-0.5 text-[9px] border rounded transition-colors duration-300 ${
                  step !== "front"
                    ? "bg-[#3a3e46] border-[#4040f2] text-[#c6c6c6]"
                    : "bg-[#2e323a] border-[#404040] text-[#7a7a7a]"
                }`}
              >
                Pinyin
              </div>
              <div
                className={`px-1.5 py-0.5 text-[9px] border rounded transition-colors duration-300 ${
                  step !== "front"
                    ? "bg-[#3a3e46] border-[#4040f2] text-[#c6c6c6]"
                    : "bg-[#2e323a] border-[#404040] text-[#7a7a7a]"
                }`}
              >
                Meaning
              </div>
            </div>
          </div>

          {/* Revealed Content */}
          <div className="space-y-1 min-h-[2.5rem] mb-3">
            <AnimatePresence>
              {step !== "front" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="text-[#c6ceff] text-sm font-medium">
                    {currentCard.pinyin}
                  </div>
                  <div className="text-[#a6a6a6] text-xs">
                    {currentCard.definition}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* HSK Badge */}
          <div className="mb-4">
            <span className="text-[9px] bg-[#35503c] text-[#4ade80] px-1.5 py-0.5 rounded-full border border-[#4ade80]/20">
              HSK {currentCard.hsk}
            </span>
          </div>

          {/* Grading Buttons */}
          <div className="grid grid-cols-6 gap-1">
            {[0, 1, 2, 3, 4, 5].map((grade) => (
              <motion.div
                key={grade}
                animate={
                  step === "graded" && grade === 4
                    ? {
                        scale: [1, 1.1, 1],
                        backgroundColor: ["#2e323a", "#4040f2", "#2e323a"],
                        borderColor: ["#404040", "#4040f2", "#404040"],
                        color: ["#a6a6a6", "#ffffff", "#a6a6a6"],
                      }
                    : {}
                }
                transition={{ duration: 0.4 }}
                className="h-7 flex items-center justify-center rounded bg-[#2e323a] border border-[#404040] text-[9px] text-[#a6a6a6]"
              >
                {grade}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Floating Elements Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-3 right-3 text-[9px] text-green-400/50 font-mono">
          SM-2 Algo
        </div>
      </div>
    </div>
  );
};

const ProgressVisual = () => {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<SVGSVGElement | null>(null);
  const inView = useInView(containerRef, { amount: 0.2, margin: "-10% 0px" });
  const pageVisible = usePageVisible();
  const active = inView && pageVisible && !prefersReducedMotion;

  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    const id = setInterval(() => {
      setStep((prev) => (prev + 1) % PROGRESS_STEPS.length);
    }, 1800);
    return () => clearInterval(id);
  }, [active]);

  const current = PROGRESS_STEPS[step];

  return (
    <div className="w-full h-full p-6 flex flex-col justify-between relative overflow-hidden">
      <div className="flex justify-between items-start mb-2 z-10">
        <div>
          <motion.div
            key={`new-${step}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-white font-bold text-2xl tabular-nums"
          >
            {current.newWords.toLocaleString()}
          </motion.div>
          <div className="text-xs text-[#a6a6a6] font-medium uppercase tracking-wider">
            New
          </div>
        </div>
        <div className="text-right">
          <motion.div
            key={`learned-${step}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-white font-bold text-2xl tabular-nums"
          >
            {current.learned.toLocaleString()}
          </motion.div>
          <div className="text-xs text-[#a6a6a6] font-medium uppercase tracking-wider">
            Learned
          </div>
        </div>
      </div>

      <div className="flex-1 relative w-full min-h-[100px]">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          <div className="w-full h-px bg-[#3a3e46]/50 dashed" />
          <div className="w-full h-px bg-[#3a3e46]/50 dashed" />
          <div className="w-full h-px bg-[#3a3e46]/50 dashed" />
        </div>

        <svg
          ref={containerRef}
          className="absolute inset-0 w-full h-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 50"
        >
          <defs>
            <linearGradient id="gradientGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gradientBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* New Words Area (Blue) */}
          <motion.path
            d={PROGRESS_NEW_PATHS[step]}
            animate={{ d: PROGRESS_NEW_PATHS[step], opacity: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            fill="url(#gradientBlue)"
            stroke="none"
            vectorEffect="non-scaling-stroke"
          />
          <motion.path
            d={PROGRESS_NEW_TOP_PATHS[step]}
            animate={{ d: PROGRESS_NEW_TOP_PATHS[step], opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Learned Words Area (Green) */}
          <motion.path
            d={PROGRESS_LEARNED_PATHS[step]}
            animate={{ d: PROGRESS_LEARNED_PATHS[step], opacity: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            fill="url(#gradientGreen)"
            stroke="none"
            vectorEffect="non-scaling-stroke"
          />
          <motion.path
            d={PROGRESS_LEARNED_TOP_PATHS[step]}
            animate={{ d: PROGRESS_LEARNED_TOP_PATHS[step], opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.05 }}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="flex justify-between text-[10px] text-[#a6a6a6] mt-2 font-mono uppercase opacity-70">
        {PROGRESS_STEPS.map((s, idx) => (
          <span
            key={s.label}
            className={idx === step ? "text-white" : undefined}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const LessonVisual = () => {
  return (
    <div className="w-full h-full p-4 flex flex-col gap-3 relative">
      <div className="absolute inset-0 bg-gradient-to-t from-[#20242b] via-transparent to-transparent z-10" />

      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-[#2e323a] border border-[#3a3e46] p-3 rounded-lg flex items-center gap-3 opacity-80"
        >
          <div className="w-10 h-10 rounded bg-[#1a1d23] flex items-center justify-center text-lg">
            {i === 1 ? "🐉" : i === 2 ? "🍜" : "🏯"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-2 w-20 bg-white/20 rounded mb-1.5" />
            <div className="h-1.5 w-12 bg-white/10 rounded" />
          </div>
          <div className="text-xs text-[#a6a6a6] border border-[#3a3e46] px-1.5 py-0.5 rounded">
            HSK {i}
          </div>
        </div>
      ))}
    </div>
  );
};

const PlacementVisual = () => {
  const [statuses, setStatuses] = useState<
    Record<number, "partial" | "unknown" | null>
  >({
    1: "partial",
    4: "unknown",
  });

  const tokens = [
    { text: "我", id: 0 },
    { text: "每天", id: 1 },
    { text: "都在", id: 2 },
    { text: "练习", id: 3 },
    { text: "中文", id: 4 },
  ];

  const toggleStatus = (id: number) => {
    setStatuses((prev) => {
      const current = prev[id];
      // Cycle: null -> partial -> unknown -> null
      if (!current) return { ...prev, [id]: "partial" };
      if (current === "partial") return { ...prev, [id]: "unknown" };
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="w-full h-full p-6 flex items-center justify-center">
      <div className="bg-[#1a1d23] border border-[#3a3e46] p-4 rounded-xl shadow-2xl max-w-[240px] w-full">
        <div className="flex flex-wrap gap-1.5 text-lg font-serif-zh text-[#a6a6a6] justify-center leading-relaxed select-none">
          {tokens.map((token) => {
            const status = statuses[token.id];
            let className =
              "px-0.5 rounded cursor-pointer transition-all duration-200 border ";

            if (status === "partial") {
              className +=
                "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
            } else if (status === "unknown") {
              className += "bg-red-500/20 text-red-400 border-red-500/50";
            } else {
              // Known (default)
              className +=
                "border-transparent hover:bg-[#4040f2]/10 hover:text-[#4040f2] hover:border-[#4040f2]/30";
            }

            return (
              <span
                key={token.id}
                className={className}
                onClick={() => toggleStatus(token.id)}
              >
                {token.text}
              </span>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 flex justify-center gap-4 text-[10px] text-[#a6a6a6] font-inter uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
            <span>Partial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]" />
            <span>Unknown</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const DictionaryVisual = () => {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(containerRef, { amount: 0.3, margin: "-10% 0px" });
  const pageVisible = usePageVisible();
  const active = inView && pageVisible && !prefersReducedMotion;

  const [step, setStep] = useState<"idle" | "hover" | "typing" | "result">(
    "idle"
  );
  const [text, setText] = useState("");

  useEffect(() => {
    if (!active) {
      setStep("idle");
      setText("");
      return;
    }

    let mounted = true;
    const wait = (ms: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    const runSequence = async () => {
      if (step === "idle") {
        setText("");
        await wait(500);
        if (mounted) setStep("hover");
      } else if (step === "hover") {
        // Move cursor to input
        await wait(800);
        if (mounted) setStep("typing");
      } else if (step === "typing") {
        // Simulate typing "ai" (pinyin)
        await wait(200);
        if (mounted) setText("a");
        await wait(150);
        if (mounted) setText("ai");
        await wait(600); // Pause before showing result
        if (mounted) setStep("result");
      } else if (step === "result") {
        // Hold result
        await wait(4000);
        if (mounted) {
          setText("");
          setStep("idle");
        }
      }
    };

    runSequence();
    return () => {
      mounted = false;
    };
  }, [active, step]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center p-6 relative"
    >
      <div className="w-full max-w-[240px] relative z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a6a6a6]" />
          <div
            className={`w-full bg-[#1a1d23] border transition-all duration-300 rounded-lg pl-9 pr-4 py-2 text-sm text-white flex items-center h-10 ${
              step === "typing" || step === "result"
                ? "border-[#4040f2] ring-1 ring-[#4040f2]/50 shadow-[0_0_15px_rgba(64,64,242,0.15)]"
                : "border-[#3a3e46]"
            }`}
          >
            {text ? (
              <span className="text-white">{text}</span>
            ) : (
              <span className="text-[#a6a6a6]">Search Hanzi...</span>
            )}
            {step === "typing" && (
              <motion.div
                layoutId="cursor-blink"
                className="w-0.5 h-4 bg-[#4040f2] ml-0.5"
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              />
            )}
          </div>

          {/* Fake Mouse Cursor */}
          <motion.div
            className="absolute z-50 pointer-events-none text-white drop-shadow-md"
            initial={{ x: 120, y: 60, opacity: 0 }}
            animate={
              step === "idle"
                ? { x: 120, y: 60, opacity: 0 }
                : step === "hover"
                  ? { x: 40, y: 10, opacity: 1, scale: 1 } // Move to input
                  : { x: 40, y: 10, opacity: 0, scale: 0.9 } // Fade out when typing
            }
            transition={{ duration: 0.7, ease: "easeInOut" }}
          >
            <MousePointer2 className="w-5 h-5 fill-black stroke-white" />
          </motion.div>
        </div>

        {/* Result Dropdown */}
        <AnimatePresence>
          {step === "result" && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="mt-2 bg-[#2e323a] border border-[#3a3e46] rounded-lg overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 p-3 bg-[#2e323a] hover:bg-[#3a3e46]/50 transition-colors">
                <div className="text-lg text-white font-semibold truncate">
                  爱
                </div>
                <span className="text-[9px] leading-none px-1.5 py-0.5 rounded-full border border-[#35503c] bg-[#26322b] text-[#4ade80]">
                  HSK 1
                </span>
              </div>
              <div className="px-3 pb-3 border-t border-[#3a3e46]/50 pt-2">
                <div className="text-[#9aa6ff] text-xs">ài</div>
                <div className="text-[#a6a6a6] text-sm mt-0.5 truncate">
                  to love / affection / to be fond of
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export function FeatureGrid() {
  return (
    <section className="py-24 px-4 max-w-6xl mx-auto" id="features">
      <div className="mb-16 md:text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 font-inter">
          Everything you need to <br />
          <span className="text-white/60">master Mandarin.</span>
        </h2>
        <p className="text-[var(--color-text-secondary)] text-lg">
          No more jumping between apps. Mandareen unifies your learning journey
          into one cohesive flow.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        {/* Row 1 */}
        <FeatureCard
          title="Conversations"
          description="Speak with an AI tutor. Get real-time feedback, translations, and grammar notes."
          icon={Mic}
          className="lg:col-span-4 bg-neutral-900/80"
          renderVisual={ConversationVisual}
        />
        <FeatureCard
          title="Progress"
          description="Track every word you learn. Visualise your journey through HSK levels."
          icon={BarChart3Icon}
          className="lg:col-span-2 bg-neutral-900/40"
          renderVisual={ProgressVisual}
        />

        {/* Row 2 */}
        <FeatureCard
          title="Flashcards"
          description="Spaced repetition (SM-2) reviews. Add words from anywhere in the app."
          icon={BrainCircuit}
          className="lg:col-span-3 bg-neutral-900/60"
          renderVisual={FlashcardVisual}
        />
        <FeatureCard
          title="AI Lessons"
          description="Generate stories or dialogues on any topic. Toggle pinyin, click for definitions."
          icon={Book}
          className="lg:col-span-3 bg-neutral-900/60"
          renderVisual={LessonVisual}
        />

        {/* Row 3 */}
        <FeatureCard
          title="Placement Test"
          description="4 passages with rising difficulty. Mark unknown words to set your HSK level instantly."
          icon={Layout}
          className="lg:col-span-2 bg-neutral-900/40"
          renderVisual={PlacementVisual}
        />
        <FeatureCard
          title="Curriculum"
          description="60+ grammar units and 300+ lessons grounded in academic standards."
          icon={GraduationCap}
          className="lg:col-span-2 bg-neutral-900/40"
          renderVisual={() => (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
              <div className="text-4xl font-bold text-white mb-2">300+</div>
              <div className="text-sm text-[#a6a6a6]">Structured Lessons</div>
            </div>
          )}
        />
        <FeatureCard
          title="Dictionary"
          description="Smart lookup for Hanzi, Pinyin, and English with HSK filtering."
          icon={Search}
          className="lg:col-span-2 bg-neutral-900/40"
          renderVisual={DictionaryVisual}
        />
      </div>
    </section>
  );
}

// Helper icon wrapper since I used a variable above
function BarChart3Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
