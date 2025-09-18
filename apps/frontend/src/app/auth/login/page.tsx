"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Sparkles, MessageSquare, BookOpen } from "lucide-react";
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
    <div className="min-h-screen bg-[#222831] flex items-center px-4 py-12 md:py-20">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        {/* Left: Minimalist brand + value prop */}
        <div className="space-y-6">
          {/* Brand */}
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-3xl">普</span>
            </div>
            <span className="text-white text-3xl font-inter font-bold">
              Mandareen
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-white font-inter font-extrabold text-4xl md:text-5xl leading-tight">
            Improve your Mandarin with AI
          </h1>
          <p className="text-[#a6a6a6] font-inter max-w-xl">
            Personalized lessons, real conversations, and spaced-repetition
            flashcards — all in one focused workspace.
          </p>

          {/* Key points */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-white">
              <Sparkles className="w-5 h-5 text-[#c6ceff]" />
              <span className="font-inter">
                AI-crafted lessons tailored to you
              </span>
            </div>
            <div className="flex items-center gap-3 text-white">
              <MessageSquare className="w-5 h-5 text-[#c6ceff]" />
              <span className="font-inter">
                Speak with an AI partner, anytime
              </span>
            </div>
            <div className="flex items-center gap-3 text-white">
              <BookOpen className="w-5 h-5 text-[#c6ceff]" />
              <span className="font-inter">
                Smart flashcards that actually stick
              </span>
            </div>
          </div>

          {/* Secondary CTA */}
          <div className="pt-2">
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 text-[#9aa6ff] hover:text-white underline-offset-4 hover:underline font-inter"
            >
              Start learning free
            </Link>
          </div>
        </div>

        {/* Right: Minimalist auth form */}
        <div className="w-full max-w-md lg:ml-auto">
          <div className="space-y-6">
            <div className="mb-2">
              <h2 className="font-inter font-semibold text-2xl text-white">
                Log in
              </h2>
              <p className="text-[#a6a6a6] text-sm mt-1">Welcome back</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <Input
                label="EMAIL"
                type="email"
                placeholder="john1233@gmail.com"
                {...register("email")}
                error={errors.email?.message}
              />

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
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />

              <div className="space-y-3 pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="full"
                  loading={isLoading}
                  disabled={isLoading || googleLoading}
                >
                  Submit
                </Button>

                <div className="relative">
                  <div
                    className="absolute inset-0 flex items-center"
                    aria-hidden="true"
                  >
                    <div className="w-full border-t border-[#a6a6a6]/30" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#222831] px-2 text-[#a6a6a6] text-xs font-inter">
                      or
                    </span>
                  </div>
                </div>

                <GoogleButton
                  type="button"
                  onClick={handleGoogleLogin}
                  loading={googleLoading}
                  disabled={isLoading || googleLoading}
                />
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
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
    </div>
  );
}
