"use client";

import { motion } from "framer-motion";
import React from "react";

type ProgressProps = {
  readTimeMinutes: number | null;
  progressStep: string | null;
  completedSteps: Record<string, boolean>;
  dialogueSteps: string[];
};

const storySteps = [
  "openai_generate_story",
  "segment_story",
  "openai_generate_grammar_notes",
  "segment_grammar_notes_and_tips",
  "persist_lesson",
];

export const ProgressBanner: React.FC<ProgressProps> = React.memo(
  ({ readTimeMinutes, progressStep, completedSteps, dialogueSteps }) => {
    const steps = readTimeMinutes === 10 ? storySteps : dialogueSteps;
    return (
      <div className="sticky top-2 z-30 mb-4">
        <motion.div
          className="relative rounded-xl px-4 py-3 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))",
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={{
              background:
                "radial-gradient(1200px 300px at -10% -50%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 60%, transparent 80%)",
              maskImage: "linear-gradient(to bottom, black, transparent 85%)",
            }}
            animate={{ backgroundPosition: ["0% 0%", "120% 0%"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="font-inter font-semibold">Generating lesson…</div>
            <div className="text-xs text-white/70">
              This can take up to several minutes
            </div>
          </div>
          <ol className="relative mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {steps.map((k) => {
              const active = progressStep === k;
              const done = !!completedSteps[k];
              return (
                <li key={k} className="flex items-center gap-2 text-xs">
                  <div
                    className={`h-3 w-3 rounded-full border backdrop-blur-sm ${
                      done
                        ? "bg-emerald-400/80 border-emerald-300/60 shadow-[0_0_10px_rgba(74,222,128,0.6)]"
                        : active
                          ? "border-white/80 motion-safe:animate-pulse"
                          : "border-white/30"
                    }`}
                  />
                  <span>
                    {k === "openai_generate_dialogue" && "Generating dialogue"}
                    {k === "openai_generate_story" && "Generating story"}
                    {k === "segment_dialogue" &&
                      "Analyzing & segmenting dialogue"}
                    {k === "segment_story" && "Analyzing & segmenting story"}
                    {k === "rag_retrieve_context" &&
                      "Retrieving grammar context"}
                    {k === "openai_generate_grammar_notes" &&
                      "Generating grammar notes"}
                    {k === "segment_grammar_notes_and_tips" &&
                      "Segmenting notes & tips"}
                    {k === "persist_lesson" && "Saving lesson"}
                  </span>
                </li>
              );
            })}
          </ol>
        </motion.div>
      </div>
    );
  }
);

ProgressBanner.displayName = "ProgressBanner";
