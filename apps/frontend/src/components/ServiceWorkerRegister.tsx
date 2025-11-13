"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Explicit opt-in via env flag to avoid stale-caching issues during dev/staging
    const swEnabled = process.env.NEXT_PUBLIC_ENABLE_SW === "true";
    if (!swEnabled) return;

    // Only attempt to register in production builds and secure contexts
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return; // localhost is treated as secure

    const swUrl = "/sw.js";

    const registerNow = async () => {
      try {
        // Avoid duplicate registrations
        const existing = await navigator.serviceWorker.getRegistration();
        if (!existing) {
          const registration = await navigator.serviceWorker.register(swUrl, {
            scope: "/",
          });

          // Minimal debug log in production
          if (process.env.NODE_ENV === "production") {
            console.log("Service worker registered", {
              scope: registration.scope,
            });
          }

          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (installing) {
              installing.addEventListener("statechange", () => {
                console.log("Service worker state:", installing.state);
              });
            }
          });
        }
      } catch (err) {
        console.warn("Service worker registration failed:", err);
      }
    };

    if (document.readyState === "complete") {
      void registerNow();
    } else {
      window.addEventListener("load", registerNow);
      return () => window.removeEventListener("load", registerNow);
    }
  }, []);

  return null;
}
