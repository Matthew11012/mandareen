"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";

const DISMISS_KEY = "verification-banner-dismissed";
const FORCE_SHOW = false; // Set to true only for manual testing
const EMAIL_VERIFICATION_ENABLED =
  process.env.NEXT_PUBLIC_EMAIL_VERIFICATION_ENABLED !== "false";

export function VerificationBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const email = session?.user?.email ?? "";
  const isVerified = session?.user?.emailVerified;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      setDismissed(stored === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  const shouldShow = useMemo(() => {
    if (!EMAIL_VERIFICATION_ENABLED) return false;
    if (FORCE_SHOW) return Boolean(session?.user);
    return session?.user && !isVerified && !dismissed;
  }, [session?.user, isVerified, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      /* ignore */
    }
  };

  const handleResend = async () => {
    if (!email) {
      toast.error("Missing email for verification.");
      return;
    }
    setIsSending(true);
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";

      const res = await fetch(`${apiBase}/auth/send-verification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to resend verification email");
      }

      toast.success("Verification email sent. Please check your inbox.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to resend verification email"
      );
    } finally {
      setIsSending(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <div className="bg-[#2a3039] text-white border border-[#4040f2]/40 rounded-xl p-4 shadow-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <ShieldAlert
            className="text-[#facc15]"
            size={16}
            aria-hidden="true"
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Verify your email</p>
          <p className="text-xs text-[#d1d5db] leading-relaxed">
            We sent a verification link to {email || "your email"}. Please
            verify to secure your account and continue using all features.
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-row items-center ">
        <Button
          type="button"
          variant="accent"
          onClick={handleResend}
          disabled={isSending}
          loading={isSending}
          className="min-h-[40px]"
          aria-label="Resend verification email"
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw size={14} aria-hidden="true" />
            <span className="text-base">Resend</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={handleDismiss}
          className="min-h-[40px] text-[#d1d5db] hover:text-white bg-[#1f2430] border border-white/10"
          aria-label="Dismiss verification banner"
        >
          <X size={20} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
