"use client";

import { motion, useReducedMotion } from "framer-motion";
import { 
  Target, 
  Sparkles, 
  BarChart3
} from "lucide-react";

export function ValuePillars() {
  const prefersReducedMotion = useReducedMotion();

  const pillars = [
    {
      icon: BarChart3,
      title: "Clear Progress",
      desc: "HSK-level dashboards and word charts show exactly where you stand.",
      color: "bg-blue-500/10 text-blue-400"
    },
    {
      icon: Sparkles,
      title: "Adaptive AI",
      desc: "Content that adapts to your level, from story topics to tutor replies.",
      color: "bg-purple-500/10 text-purple-400"
    },
    {
      icon: Target,
      title: "Full-Skill Coverage",
      desc: "Read, listen, speak, and review vocabulary in one cohesive flow.",
      color: "bg-emerald-500/10 text-emerald-400"
    }
  ];

  return (
    <section className="py-20 px-4 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pillars.map((p, i) => (
          <motion.div
            key={i}
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            className="p-6 rounded-2xl bg-neutral-900/40 border border-white/5 hover:border-white/10 transition-colors"
          >
            <div className={`w-12 h-12 rounded-xl ${p.color} flex items-center justify-center mb-4`}>
              <p.icon size={24} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 font-inter">{p.title}</h3>
            <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">{p.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
