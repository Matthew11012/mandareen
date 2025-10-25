"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe reduced-motion detection.
 * Falls back to false during SSR and updates on client.
 */
export function useReducedMotionSafe(): boolean {
  const [prefersReducedMotion, set] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => set(!!mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return prefersReducedMotion;
}
