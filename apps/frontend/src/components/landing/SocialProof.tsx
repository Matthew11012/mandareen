"use client";

import { motion } from "framer-motion";

export function SocialProof() {
  return (
    <section className="border-y border-white/5 bg-neutral-950/50 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-12 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="text-center md:text-left">
           <h3 className="text-3xl font-bold text-white mb-2 tabular-nums">2,000+</h3>
           <p className="text-[var(--color-text-secondary)] text-sm uppercase tracking-wide">Active Learners</p>
        </div>
        
        <div className="h-px w-24 bg-white/10 md:h-12 md:w-px" />

        <div className="text-center md:text-left">
           <h3 className="text-3xl font-bold text-white mb-2 tabular-nums">150k+</h3>
           <p className="text-[var(--color-text-secondary)] text-sm uppercase tracking-wide">Words Learned</p>
        </div>

        <div className="h-px w-24 bg-white/10 md:h-12 md:w-px" />

        <div className="text-center md:text-left">
           <h3 className="text-3xl font-bold text-white mb-2 tabular-nums">12k+</h3>
           <p className="text-[var(--color-text-secondary)] text-sm uppercase tracking-wide">Lessons Generated</p>
        </div>

        <div className="flex-1 hidden md:flex justify-end">
           <motion.div 
             initial={{ opacity: 0, x: 20 }}
             whileInView={{ opacity: 1, x: 0 }}
             transition={{ duration: 0.8 }}
             className="max-w-xs text-right italic text-[var(--color-text-secondary)]"
           >
              “Mandareen made daily Mandarin finally stick. Ten minutes a day, real progress.”
              <div className="not-italic text-white mt-2 text-sm font-semibold">— Early User</div>
           </motion.div>
        </div>
      </div>
    </section>
  );
}
