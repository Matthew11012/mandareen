"use client";

import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";

export function BackgroundEffects() {
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const depthScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const depthOpacity = useTransform(scrollYProgress, [0, 1], [0.2, 0.5]);
  const gridOpacity = useTransform(scrollYProgress, [0, 1], [0.06, 0.16]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={
        prefersReducedMotion
          ? undefined
          : { scale: depthScale, opacity: depthOpacity }
      }
    >
      {/* Radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(255,255,255,0.08),transparent_60%)]" />
      {/* Soft grid */}
      <motion.div
        className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_60%)]"
        style={prefersReducedMotion ? undefined : { opacity: gridOpacity }}
      />
    </motion.div>
  );
}
