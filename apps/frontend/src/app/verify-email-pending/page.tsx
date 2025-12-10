"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

function PendingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const email = searchParams.get("email") || "";
  const plan = searchParams.get("plan");
  const billingPeriod = searchParams.get("billingPeriod");
  const redirect = searchParams.get("redirect");

  const [isResending, setIsResending] = useState(false);

  const summary = useMemo(() => {
    if (!plan) return null;
    const planLabel = plan === "PREMIUM" ? "Premium" : "Basic";
    const billingLabel =
      billingPeriod === "YEARLY"
        ? "billed yearly"
        : billingPeriod === "MONTHLY"
        ? "billed monthly"
        : "billing selected";
    return `${planLabel} • ${billingLabel}`;
  }, [plan, billingPeriod]);

  const handleResend = async () => {
    if (!email) {
      toast.error("Missing email to resend verification.");
      return;
    }
    setIsResending(true);
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";

      const body: Record<string, string> = {
        email,
      };

      if (redirect) {
        body.redirect = redirect;
      }
      if (plan) {
        body.plan = plan;
      }
      if (billingPeriod) {
        body.billingPeriod = billingPeriod;
      }

      const res = await fetch(`${apiBase}/auth/send-verification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
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
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-[#4040f2] to-[#6366f1] flex items-center justify-center shadow-lg">
            <Mail className="text-white" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="text-white text-2xl font-semibold">
              Check your email
            </h1>
            <p className="text-[#a6a6a6] text-sm">
              We sent a verification link to {email || "your email"}.
              <br />
              Open it to verify and continue.
            </p>
            {summary ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-[#2a3039] px-3 py-1 text-xs text-[#d0d3ff] border border-[#4040f2]/40">
                <ShieldCheck size={14} aria-hidden="true" />
                <span>{summary}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="bg-[#2a3039] rounded-2xl shadow-xl p-6 space-y-6">
          <div className="space-y-2">
            <p className="text-white font-medium text-sm">Didn&apos;t get it?</p>
            <p className="text-[#a6a6a6] text-sm">
              Check your spam folder, or resend the verification email.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              loading={isResending}
              className="min-h-[44px] w-full sm:w-auto"
              aria-label="Resend verification email"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={16} aria-hidden="true" />
                Resend email
              </span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/login")}
              className="min-h-[44px] w-full sm:w-auto"
              aria-label="Return to login"
            >
              Back to login
            </Button>
          </div>

          <div className="text-xs text-[#8b8f9c] space-y-1">
            <p>
              Make sure you entered the correct email. If you need to change it,
              go back and sign up again with the right address.
            </p>
            <p>
              Verification links expire in 1 hour. Resending will generate a new
              link.
            </p>
          </div>
        </div>

        <div className="text-center text-sm text-[#a6a6a6] space-y-1">
          <p>
            Need help?{" "}
            <Link
              href="mailto:support@mandareen.com"
              className="text-[#9aa6ff] hover:text-white underline-offset-4 hover:underline"
            >
              Contact support
            </Link>
          </p>
          <p>
            Want to try another plan?{" "}
            <Link
              href="/pricing"
              className="text-[#9aa6ff] hover:text-white underline-offset-4 hover:underline"
            >
              View pricing
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPendingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#222831] flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" />
            <p className="text-white font-inter text-sm">Loading...</p>
          </div>
        </div>
      }
    >
      <PendingContent />
    </Suspense>
  );
}

