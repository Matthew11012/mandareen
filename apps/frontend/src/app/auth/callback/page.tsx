"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/stores/auth-store";
import { authClient } from "@/lib/auth-client";
import { useCheckoutMutation } from "@/lib/hooks/use-billing";
import { BillingPeriod } from "@/lib/api/billing";

/**
 * Google OAuth Callback Handler
 *
 * This page handles the callback from Google OAuth after user authentication.
 * The backend redirects here with either:
 * - Success: ?token=JWT_TOKEN
 * - Error: redirects to /auth/error
 *
 * Features:
 * - Extracts JWT token from URL parameters
 * - Stores token and updates auth state
 * - Checks sessionStorage for redirect URL with plan info
 * - Triggers checkout if plan info exists, otherwise redirects to dashboard
 * - Handles error cases gracefully
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);
  const checkoutMutation = useCheckoutMutation();

  useAuthStore();

  // Parse redirect URL to extract plan info
  const parseRedirectUrl = (url: string | null) => {
    if (!url) return null;

    try {
      const urlObj = new URL(url, window.location.origin);
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
  };

  // Handle checkout after successful OAuth
  const handleCheckoutAfterOAuth = async (
    planCode: "BASIC" | "PREMIUM",
    billingPeriod: BillingPeriod
  ) => {
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
      console.error("Checkout error after OAuth:", error);
      // Redirect to pricing page with plan selected as fallback
      router.push(`/pricing?plan=${planCode}&billingPeriod=${billingPeriod}`);
    }
  };

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const error = searchParams.get("error");
        const mode = searchParams.get("mode");

        if (error === "invalid_token") {
          toast.error("Verification link expired. Please request a new one.");
          const email = searchParams.get("email");
          const params = new URLSearchParams();
          if (email) params.set("email", email);
          router.push(
            params.toString()
              ? `/verify-email-pending?${params.toString()}`
              : "/verify-email-pending"
          );
          return;
        }

        if (error) throw new Error(error);

        // Better Auth sets the session cookie automatically
        // Check for Better Auth session
        const session = await authClient.getSession();

        if (!session.data?.user) {
          throw new Error("No session found after OAuth callback");
        }

        const email = session.data.user.email;
        if (!session.data.user.emailVerified) {
          toast.info(
            "Welcome! Please verify your email to secure your account."
          );
          // Fire-and-forget resend for social users if not verified
          const apiBase =
            process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
            "http://localhost:3000";
          const params = new URLSearchParams({ email, mode: "verify-email" });
          const storedSignupRedirectUrl = sessionStorage.getItem(
            "signup_redirect_url"
          );
          if (storedSignupRedirectUrl) {
            params.set("redirect", storedSignupRedirectUrl);
            const planInfo = parseRedirectUrl(storedSignupRedirectUrl);
            if (planInfo) {
              params.set("plan", planInfo.planCode);
              params.set("billingPeriod", planInfo.billingPeriod);
            }
          }
          void fetch(`${apiBase}/auth/send-verification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              email,
              redirect: params.get("redirect") ?? undefined,
              plan: params.get("plan") ?? undefined,
              billingPeriod: params.get("billingPeriod") ?? undefined,
            }),
          });
        }

        // Update auth store with Better Auth user info
        // Note: Better Auth uses string IDs, but we need to map to legacy user
        // The AuthGuard on backend handles this mapping
        // For now, we'll fetch the user from the backend to get the legacy user ID
        const { authApi } = await import("@/lib/api/auth");
        const me = await authApi.me();

        useAuthStore.setState({
          user: {
            id: me.id,
            email: me.email,
            username: me.username ?? me.email?.split("@")[0] ?? "",
          },
          token: null,
          isAuthenticated: true,
        });

        const successMessage =
          mode === "verify-email"
            ? "Email verified successfully! Welcome to Mandareen."
            : "Successfully signed in with Google!";
        toast.success(successMessage);

        // Check sessionStorage for redirect URL with plan info (from signup)
        const storedSignupRedirectUrl = sessionStorage.getItem(
          "signup_redirect_url"
        );
        if (storedSignupRedirectUrl) {
          // Remove from sessionStorage after reading
          sessionStorage.removeItem("signup_redirect_url");

          const planInfo = parseRedirectUrl(storedSignupRedirectUrl);
          if (planInfo) {
            // Automatically trigger checkout for the selected plan
            await handleCheckoutAfterOAuth(
              planInfo.planCode,
              planInfo.billingPeriod
            );
            return;
          } else {
            // Redirect to the stored URL if no plan info
            router.replace(storedSignupRedirectUrl);
            return;
          }
        }

        // Check for login redirect URL
        const storedLoginRedirectUrl =
          sessionStorage.getItem("login_redirect_url");
        if (storedLoginRedirectUrl) {
          sessionStorage.removeItem("login_redirect_url");
          router.replace(storedLoginRedirectUrl);
          return;
        }

        // Default: redirect to dashboard
        router.replace("/dashboard");
      } catch (error) {
        console.error("OAuth callback error:", error);
        toast.error("Authentication failed. Please try again.");
        router.push("/login");
      } finally {
        setIsProcessing(false);
      }
    };

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center">
      <div className="text-center space-y-4">
        {isProcessing ? (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" />
            <h2 className="text-white font-inter text-lg">
              Completing sign in...
            </h2>
            <p className="text-[#a6a6a6] font-inter text-sm">
              Please wait while we finish setting up your account.
            </p>
          </>
        ) : (
          <>
            <div className="h-12 w-12 mx-auto text-red-400">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h2 className="text-white font-inter text-lg">
              Authentication Error
            </h2>
            <p className="text-[#a6a6a6] font-inter text-sm">
              Something went wrong. Redirecting to login...
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#222831] flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" />
            <h2 className="text-white font-inter text-lg">Loading...</h2>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
