"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/stores/auth-store";
import { authApi } from "@/lib/api/auth";

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
 * - Redirects to dashboard on success
 * - Handles error cases gracefully
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);

  useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const error = searchParams.get("error");
        if (error) throw new Error(error);

        // HttpOnly cookie is already set by backend; fetch current user
        const me = await authApi.me();
        useAuthStore.setState({
          user: { id: me.id, email: me.email },
          token: null,
          isAuthenticated: true,
        });

        toast.success("Successfully signed in with Google!");
        router.replace("/dashboard");
      } catch (error) {
        console.error("OAuth callback error:", error);
        toast.error("Authentication failed. Please try again.");
        router.push("/auth/login");
      } finally {
        setIsProcessing(false);
      }
    };

    handleCallback();
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
