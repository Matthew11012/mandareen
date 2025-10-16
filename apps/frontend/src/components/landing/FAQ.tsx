"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

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

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
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
              className={`grid transition-all duration-300 ease-[var(--motion-ease)] ${
                open === idx
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-70"
              }`}
            >
              <div className="overflow-hidden">
                <p className="mt-2 text-[var(--color-text-secondary)]">{f.a}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
