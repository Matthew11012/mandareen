"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { useAuth, useRedirectAuthenticated } from "@/lib/hooks/use-auth";
import { registerSchema, type RegisterData, authApi } from "@/lib/api/auth";
import { validatePassword } from "@/lib/utils";

export default function SignupPage() {
  const { isLoading: authChecking } = useRedirectAuthenticated();
  const { register: registerUser, isLoading, clearError } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Build refined schema to avoid any cast and ensure proper typing
  const formSchema = registerSchema
    .extend({
      confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const password = watch("password");
  const passwordValidation = password
    ? validatePassword(password)
    : { isValid: false, errors: [] };

  const onSubmit = async (data: RegisterData) => {
    try {
      clearError();
      await registerUser(data);
      toast.success("Account created. Welcome to Mandareen!");
    } catch {
      toast.error("Registration failed. Please try again.");
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setGoogleLoading(true);
      clearError();
      const googleAuthUrl = authApi.getGoogleAuthUrl();
      window.location.href = googleAuthUrl;
    } catch {
      setGoogleLoading(false);
      toast.error("Failed to initiate Google sign up");
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
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4 sm:py-8">
      <div className="w-full max-w-md">
        <div className="sm:bg-[#2a3039] sm:rounded-2xl sm:shadow-xl p-6 pb-2 sm:p-8">
          <div className="mb-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-2xl">普</span>
              </div>
            </div>
            <h1 className="text-white text-2xl font-semibold">
              Create your account
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
              placeholder="Create a strong password"
              autoComplete="new-password"
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

            {password && (
              <div className="bg-[#393e46] rounded-lg p-3 space-y-2">
                <p className="text-white text-xs font-medium">
                  Password Requirements
                </p>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2 text-xs">
                    {password.length >= 8 ? (
                      <Check size={12} className="text-green-400" />
                    ) : (
                      <X size={12} className="text-red-400" />
                    )}
                    <span
                      className={
                        password.length >= 8 ? "text-green-400" : "text-red-400"
                      }
                    >
                      At least 8 characters
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-xs">
                    {/[a-z]/.test(password) ? (
                      <Check size={12} className="text-green-400" />
                    ) : (
                      <X size={12} className="text-red-400" />
                    )}
                    <span
                      className={
                        /[a-z]/.test(password)
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      One lowercase letter
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-xs">
                    {/[A-Z]/.test(password) ? (
                      <Check size={12} className="text-green-400" />
                    ) : (
                      <X size={12} className="text-red-400" />
                    )}
                    <span
                      className={
                        /[A-Z]/.test(password)
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      One uppercase letter
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-xs">
                    {/\d/.test(password) ? (
                      <Check size={12} className="text-green-400" />
                    ) : (
                      <X size={12} className="text-red-400" />
                    )}
                    <span
                      className={
                        /\d/.test(password) ? "text-green-400" : "text-red-400"
                      }
                    >
                      One number
                    </span>
                  </li>
                </ul>
              </div>
            )}

            <Input
              label="CONFIRM PASSWORD"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm your password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              error={errors.confirmPassword?.message}
              icon={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  className="hover:text-white transition-colors cursor-pointer"
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              }
            />

            <Button
              type="submit"
              variant="primary"
              size="full"
              loading={isLoading}
              disabled={
                isLoading || googleLoading || !passwordValidation.isValid
              }
              className="bg-[#4040f2] hover:bg-[#3636d9] text-white shadow-[0_8px_20px_rgba(64,64,242,0.35)] hover:shadow-[0_10px_24px_rgba(64,64,242,0.45)] transition-all min-h-[44px]"
              aria-label="Create account"
            >
              <span className="inline-flex items-center text-base gap-2">
                Create account
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
              onClick={handleGoogleSignup}
              loading={googleLoading}
              disabled={isLoading || googleLoading}
              className="min-h-[44px] w-full"
            >
              Sign up with Google
            </GoogleButton>

            <div className="text-center text-sm text-[#a6a6a6]">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-[#9aa6ff] hover:text-white underline-offset-4 hover:underline"
              >
                Log in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
