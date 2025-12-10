"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { useAuth, useRedirectAuthenticated } from "@/lib/hooks/use-auth";
import { loginSchema, type LoginData } from "@/lib/api/auth";
import { useCheckoutMutation } from "@/lib/hooks/use-billing";
import { BillingPeriod } from "@/lib/api/billing";
import { signIn } from "@/lib/auth-client";

const EMAIL_VERIFICATION_ENABLED =
  process.env.NEXT_PUBLIC_EMAIL_VERIFICATION_ENABLED !== "false";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: authChecking } = useRedirectAuthenticated();
  const { clearError } = useAuth();
  const checkoutMutation = useCheckoutMutation();

  // Get redirect URL from query params
  const redirectUrl = searchParams.get("redirect");

  // Parse redirect URL to check if it contains plan info
  const planInfo = redirectUrl
    ? (() => {
        try {
          const urlObj = new URL(redirectUrl, window.location.origin);
          const plan = urlObj.searchParams.get("plan");
          const billingPeriod = urlObj.searchParams.get("billingPeriod");

          if (plan && ["BASIC", "PREMIUM"].includes(plan)) {
            return {
              planCode: plan as "BASIC" | "PREMIUM",
              billingPeriod:
                (billingPeriod as BillingPeriod) || BillingPeriod.MONTHLY,
            };
          }
        } catch (error) {
          console.error("Failed to parse redirect URL:", error);
        }
        return null;
      })()
    : null;

  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Handle checkout after successful login
  const handleCheckoutAfterLogin = async (
    planCode: "BASIC" | "PREMIUM",
    billingPeriod: BillingPeriod
  ) => {
    setIsProcessingCheckout(true);
    try {
      const response = await checkoutMutation.mutateAsync({
        planCode,
        billingPeriod,
      });

      if (response.url) {
        window.location.href = response.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Checkout error after login:", error);
      setIsProcessingCheckout(false);
      // Redirect to pricing page with plan selected as fallback
      router.push(`/pricing?plan=${planCode}&billingPeriod=${billingPeriod}`);
    }
  };

  const onSubmit = async (data: LoginData) => {
    try {
      setFormSubmitting(true);
      clearError();
      const result = await signIn.email({
        email: data.email,
        password: data.password,
      });

      if (result.error) {
        const status = (result.error as { status?: number })?.status;
        const code = (result.error as { code?: string })?.code;
        if (
          EMAIL_VERIFICATION_ENABLED &&
          (status === 403 || code === "EMAIL_NOT_VERIFIED")
        ) {
          toast.error(
            "Please verify your email address before logging in. We’ve sent you a verification email."
          );
          const params = new URLSearchParams({ email: data.email });
          if (planInfo) {
            params.set("plan", planInfo.planCode);
            params.set("billingPeriod", planInfo.billingPeriod);
          }
          if (redirectUrl) {
            params.set("redirect", redirectUrl);
          }
          router.push(`/verify-email-pending?${params.toString()}`);
          setShowResend(true);
          return;
        }
        throw new Error(result.error.message ?? "Sign in failed");
      }
      toast.success("Welcome back!");

      // Check if redirect URL contains plan info for automatic checkout
      if (planInfo) {
        // Automatically trigger checkout for the selected plan
        await handleCheckoutAfterLogin(
          planInfo.planCode,
          planInfo.billingPeriod
        );
      } else if (redirectUrl) {
        // Redirect to the specified URL if no plan info
        router.push(redirectUrl);
      } else {
        // Default: redirect to dashboard
        router.push("/dashboard");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Login failed. Please check your credentials."
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleResend = async (email: string) => {
    if (!email) {
      toast.error("Enter your email to resend verification.");
      return;
    }
    setIsResending(true);
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";

      const body: Record<string, string> = { email };
      if (redirectUrl) {
        body.redirect = redirectUrl;
      }
      if (planInfo) {
        body.plan = planInfo.planCode;
        body.billingPeriod = planInfo.billingPeriod;
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

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      clearError();

      // Store redirect URL in sessionStorage so it persists through OAuth flow
      if (redirectUrl) {
        sessionStorage.setItem("login_redirect_url", redirectUrl);
      }

      // Use absolute frontend URL for callback
      // Better Auth processes callback on backend, so it needs full URL to redirect to frontend
      const frontendUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3001";
      const response = await signIn.social({
        provider: "google",
        callbackURL: `${frontendUrl}/auth/callback`,
      });

      if (response.error) {
        throw new Error(response.error.message ?? "Google sign-in failed");
      }

      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      setGoogleLoading(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to initiate Google login"
      );
    }
  };

  // Show loading state while checking auth or processing checkout
  if (authChecking || isProcessingCheckout) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" />
          {isProcessingCheckout && (
            <p className="text-white font-inter text-sm">
              Preparing your checkout...
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="sm:bg-[#2a3039] sm:rounded-2xl sm:shadow-xl p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <Link
                href="/"
                aria-label="Go to home"
                className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a3039]"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">普</span>
                </div>
              </Link>
            </div>
            <h1 className="text-white text-2xl font-semibold">Log in</h1>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="EMAIL"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              {...register("email")}
              error={errors.email?.message}
            />

            <Input
              label="PASSWORD"
              type={showPassword ? "text" : "password"}
              placeholder="Your password"
              autoComplete="current-password"
              {...register("password")}
              error={errors.password?.message}
              icon={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="hover:text-white transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <Button
              type="submit"
              variant="primary"
              size="full"
              loading={formSubmitting}
              disabled={formSubmitting || googleLoading}
              className="bg-[#4040f2] hover:bg-[#3636d9] text-white shadow-[0_8px_20px_rgba(64,64,242,0.35)] hover:shadow-[0_10px_24px_rgba(64,64,242,0.45)] transition-all min-h-[44px]"
              aria-label="Log in"
            >
              <span className="inline-flex items-center text-base gap-2">
                Log in
              </span>
            </Button>

            {showResend && (
              <div className="space-y-2">
                <p className="text-[#a6a6a6] text-sm">
                  Didn&apos;t get the verification email? Resend it below.
                </p>
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => handleResend(getValues().email)}
                  disabled={isResending}
                  loading={isResending}
                  className="min-h-[44px] w-full"
                  aria-label="Resend verification email"
                >
                  Resend verification email
                </Button>
              </div>
            )}

            <div className="relative">
              <div
                className="absolute inset-0 flex items-center"
                aria-hidden="true"
              >
                <div className="w-full border-t border-[#a6a6a6]/30" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#2a3039] px-2 text-[#a6a6a6] text-xs">
                  or
                </span>
              </div>
            </div>

            <GoogleButton
              type="button"
              onClick={handleGoogleLogin}
              loading={googleLoading}
              disabled={formSubmitting || googleLoading}
              className="min-h-[44px] w-full"
            />

            <div className="text-center text-sm text-[#a6a6a6]">
              Don’t have an account?{" "}
              <Link
                href="/signup"
                className="text-[#9aa6ff] hover:text-white underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
      <LoginPageContent />
    </Suspense>
  );
}
