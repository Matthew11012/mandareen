"use client";

import { PropsWithChildren } from "react";
import { motion, useReducedMotion } from "framer-motion";

type SectionInViewProps = PropsWithChildren<{
  delay?: number;
  duration?: number;
  className?: string;
}>;

export function SectionInView({
  children,
  delay = 0,
  duration = 0.6,
  className,
}: SectionInViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const ease = [0.2, 0.8, 0.2, 1] as const;
  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { y: 12, opacity: 0 },
        whileInView: { y: 0, opacity: 1 },
        viewport: { once: true, amount: 0.6 },
        transition: { duration, ease, delay },
      };

  return (
    <motion.div {...motionProps} className={className}>
      {children}
    </motion.div>
  );
}
