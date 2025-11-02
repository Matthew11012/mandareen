"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
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

          // Optional: log registration state to aid debugging
          if (process.env.NODE_ENV === "production") {
            // eslint-disable-next-line no-console
            console.log("Service worker registered:", {
              scope: registration.scope,
              active: !!registration.active,
              installing: !!registration.installing,
              waiting: !!registration.waiting,
            });
          }

          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (installing) {
              installing.addEventListener("statechange", () => {
                // eslint-disable-next-line no-console
                console.log("Service worker state:", installing.state);
              });
            }
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
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
