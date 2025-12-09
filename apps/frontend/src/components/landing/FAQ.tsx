"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

const FAQ_ITEMS = [
  {
    q: "How is my HSK level determined?",
    a: "We use a 4-part AI placement test with rising difficulty. You simply read passages and tap words you don't know. Our algorithm calculates your vocabulary coverage and assigns a precise HSK level (1-9)."
  },
  {
    q: "Can I adjust the difficulty of lessons?",
    a: "Yes. While we recommend content at your detected level, you can manually set the target HSK level for any generated lesson or conversation. You can also control the 'timeframe' (e.g., modern vs. imperial/mythic) to change the flavor of the language."
  },
  {
    q: "Do lessons include pinyin and translations?",
    a: "Absolutely. Every AI lesson and conversation message has toggleable pinyin and full English translations. You can also click any individual word to see its definition and add it to your flashcards."
  },
  {
    q: "How does the flashcard system work?",
    a: "We use the SM-2 spaced repetition algorithm. Words are scheduled for review based on how well you know them (Strong, Partial, Weak). You can add words from lessons, dictionary lookups, or conversations instantly."
  },
  {
    q: "Is speaking supported?",
    a: "Yes! The Conversations feature lets you speak (audio-only) with an AI tutor. It provides transcriptions, pinyin overlays, and even generates grammar notes based on the tutor's replies to help you understand sentence structures."
  },
  {
    q: "What is included in the Curriculum?",
    a: "The curriculum contains over 60 grammar units and 300+ lessons grounded in the 'Modern Mandarin Chinese Grammar' book. It covers everything from basic sentence structures to advanced patterns, available on-demand."
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-24 px-4 max-w-3xl mx-auto" id="faq">
      <h2 className="text-3xl font-bold text-white mb-12 text-center font-inter">Common Questions</h2>
      
      <div className="space-y-4">
        {FAQ_ITEMS.map((item, i) => (
          <div 
            key={i}
            className="rounded-2xl border border-white/5 bg-neutral-900/30 overflow-hidden"
          >
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-white/90 pr-8">{item.q}</span>
              <Plus 
                className={`w-5 h-5 text-white/50 transition-transform duration-300 ${openIndex === i ? "rotate-45" : ""}`} 
              />
            </button>
            
            <AnimatePresence>
              {openIndex === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="px-6 pb-6 text-[var(--color-text-secondary)] leading-relaxed text-sm">
                    {item.a}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}
