"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { useAuth, useRedirectAuthenticated } from "@/lib/hooks/use-auth";
import { loginSchema, type LoginData } from "@/lib/api/auth";
import { authApi } from "@/lib/api/auth";

/**
 * Login Page Component
 *
 * Features:
 * - Email/password authentication with backend integration
 * - Google OAuth authentication
 * - Form validation using React Hook Form + Zod
 * - Loading states and error handling
 * - Figma design system implementation
 * - Automatic redirect for authenticated users
 */
export default function LoginPage() {
  // Redirect if already authenticated
  const { isLoading: authLoading } = useRedirectAuthenticated();

  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login, isLoading, clearError } = useAuth();

  // Form setup with Zod validation
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  /**
   * Handle email/password login form submission
   */
  const onSubmit = async (data: LoginData) => {
    try {
      clearError();
      await login(data);
      toast.success("Welcome back!");
    } catch {
      // Error is already set in the auth store
      toast.error("Login failed. Please check your credentials.");
    }
  };

  /**
   * Handle Google OAuth login
   */
  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      clearError();

      const googleAuthUrl = authApi.getGoogleAuthUrl();
      window.location.href = googleAuthUrl;
    } catch {
      setGoogleLoading(false);
      toast.error("Failed to initiate Google login");
    }
  };

  // Show loading spinner while checking auth status
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4 py-12 md:py-20 relative">
      <div className="w-full max-w-md z-10 relative">
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="font-inter font-extrabold text-5xl leading-tight text-white">
            Login
          </h1>
        </div>

        {/* Main Form Container - Matching Figma styling exactly */}
        <div className="bg-[#2e323a] rounded-[20px] border border-[#3a3f47] shadow-[0_8px_24px_rgba(0,0,0,0.35)] p-6 md:p-8 relative z-20">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6 relative z-30"
          >
            {/* Email Input */}
            <Input
              label="USERNAME"
              type="email"
              placeholder="john1233@gmail.com"
              {...register("email")}
              error={errors.email?.message}
            />

            {/* Password Input */}
            <div>
              <Input
                label="PASSWORD"
                type={showPassword ? "text" : "password"}
                placeholder="password"
                {...register("password")}
                error={errors.password?.message}
                icon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
            </div>

            {/* Submit and Google OAuth Buttons */}
            <div className="space-y-3 pt-1">
              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="full"
                loading={isLoading}
                disabled={isLoading || googleLoading}
              >
                Submit
              </Button>

              {/* Divider */}
              <div className="relative">
                <div
                  className="absolute inset-0 flex items-center"
                  aria-hidden="true"
                >
                  <div className="w-full border-t border-[#a6a6a6]/30" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#2e323a] px-2 text-[#a6a6a6] text-xs font-inter">
                    or
                  </span>
                </div>
              </div>

              {/* Google OAuth Button */}
              <GoogleButton
                type="button"
                onClick={handleGoogleLogin}
                loading={googleLoading}
                disabled={isLoading || googleLoading}
              />
            </div>

            {/* Sign Up Link */}
            <div className="flex items-center place-content-center gap-2 pt-2">
              <span className="text-white text-sm font-inter">
                Don&apos;t have an account?
              </span>
              <Link
                href="/auth/signup"
                className="text-[#1f73f2] text-sm font-inter underline-offset-4 hover:underline"
              >
                Sign up here
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
