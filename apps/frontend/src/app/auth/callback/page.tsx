"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/stores/auth-store";

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
        // Extract token from URL parameters
        const token = searchParams.get("token");
        const error = searchParams.get("error");

        if (error) {
          throw new Error(error);
        }

        if (!token) {
          throw new Error("No authentication token received");
        }

        // Store the token in both localStorage and cookies
        localStorage.setItem("auth-token", token);
        // Set cookie for middleware access (expires in 1 day)
        document.cookie = `auth-token=${token}; path=/; max-age=86400; SameSite=Lax`;

        // For Google OAuth, we need to fetch user data from the token
        // Since the backend already validated and created/found the user,
        // we can decode the JWT to get user info (or make an API call)

        // Simple JWT decode (in production, consider using a proper JWT library)
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        // Add padding if needed
        const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(window.atob(paddedBase64));

        // Update auth state
        const authState = {
          user: {
            id: payload.sub,
            email: payload.email,
          },
          token,
          isAuthenticated: true,
        };

        // Update Zustand store
        useAuthStore.setState(authState);

        toast.success("Successfully signed in with Google!");
        router.push("/dashboard");
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
