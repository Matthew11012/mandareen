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
import { loginSchema, type LoginData, authApi } from "@/lib/api/auth";

export default function LoginPage() {
  const { isLoading: authChecking } = useRedirectAuthenticated();
  const { login, isLoading, clearError } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginData) => {
    try {
      clearError();
      await login(data);
      toast.success("Welcome back!");
    } catch {
      toast.error("Login failed. Please check your credentials.");
    }
  };

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

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="sm:bg-[#2a3039] sm:rounded-2xl sm:shadow-xl p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-2xl">普</span>
              </div>
            </div>
            <h1 className="text-white text-2xl font-semibold">
              Log in to Mandareen
            </h1>
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
              loading={isLoading}
              disabled={isLoading || googleLoading}
              className="bg-[#4040f2] hover:bg-[#3636d9] text-white shadow-[0_8px_20px_rgba(64,64,242,0.35)] hover:shadow-[0_10px_24px_rgba(64,64,242,0.45)] transition-all min-h-[44px]"
              aria-label="Log in"
            >
              <span className="inline-flex items-center text-base gap-2">
                Log in
              </span>
            </Button>

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
              disabled={isLoading || googleLoading}
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
