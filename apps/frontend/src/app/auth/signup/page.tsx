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
import { registerSchema, type RegisterData } from "@/lib/api/auth";
import { authApi } from "@/lib/api/auth";
import { validatePassword } from "@/lib/utils";

/**
 * Sign Up Page Component
 *
 * Features:
 * - New user registration with backend integration
 * - Real-time password strength validation
 * - Password confirmation matching
 * - Google OAuth registration
 * - Form validation using React Hook Form + Zod
 * - Loading states and error handling
 * - Figma design system implementation
 */
export default function SignUpPage() {
  // Redirect if already authenticated
  const { isLoading: authLoading } = useRedirectAuthenticated();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { register: registerUser, isLoading, clearError } = useAuth();

  // Enhanced form setup with password confirmation
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterData & { confirmPassword: string }>({
    resolver: zodResolver(
      registerSchema
        .extend({
          confirmPassword: z.string().min(1, "Please confirm your password"),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Passwords don't match",
          path: ["confirmPassword"],
        })
    ),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onChange", // Real-time validation
  });

  // Watch password for real-time strength validation
  const password = watch("password");
  const passwordValidation = password
    ? validatePassword(password)
    : { isValid: false, errors: [] };

  /**
   * Handle registration form submission
   */
  const onSubmit = async (data: RegisterData) => {
    try {
      clearError();

      await registerUser(data);
      toast.success("Welcome to Mandareen! Your account has been created.");
    } catch {
      // Error is already set in the auth store
      toast.error("Registration failed. Please try again.");
    }
  };

  /**
   * Handle Google OAuth registration
   */
  const handleGoogleSignUp = async () => {
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

  // Show loading spinner while checking auth status
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4 py-12 md:py-20">
      <div className="w-full max-w-md">
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="font-inter font-extrabold text-5xl leading-tight text-white">
            Sign Up
          </h1>
        </div>

        {/* Main Form Container - Matching Figma styling */}
        <div className="bg-[#2e323a] rounded-[20px] border border-[#3a3f47] shadow-[0_8px_24px_rgba(0,0,0,0.35)] p-6 md:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email Input */}
            <Input
              label="EMAIL"
              type="email"
              placeholder="Enter your email address"
              {...register("email")}
              error={errors.email?.message}
            />

            {/* Password Input with Strength Indicator */}
            <div className="space-y-2">
              <Input
                label="PASSWORD"
                type={showPassword ? "text" : "password"}
                placeholder="Create a strong password"
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

              {/* Password Strength Indicator */}
              {password && (
                <div className="bg-[#393e46] rounded-lg p-3 space-y-2">
                  <p className="text-white text-xs font-inter font-medium">
                    Password Requirements:
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
                          password.length >= 8
                            ? "text-green-400"
                            : "text-red-400"
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
                          /\d/.test(password)
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        One number
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <Input
              label="CONFIRM PASSWORD"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm your password"
              {...register("confirmPassword")}
              error={errors.confirmPassword?.message}
              icon={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="hover:text-white transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              }
            />

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="full"
              loading={isLoading}
              disabled={
                isLoading || googleLoading || !passwordValidation.isValid
              }
            >
              Create Account
            </Button>

            {/* Login Link */}
            <div className="flex items-center justify-center gap-1">
              <span className="text-white text-xs font-inter">
                Already have an account?
              </span>
              <Link
                href="/auth/login"
                className="text-[#1f73f2] text-sm font-inter underline-offset-4 hover:underline"
              >
                Login here
              </Link>
            </div>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#a6a6a6]/30"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#2e323a] px-2 text-[#a6a6a6] font-inter">
                or
              </span>
            </div>
          </div>

          {/* Google OAuth Button */}
          <GoogleButton
            onClick={handleGoogleSignUp}
            loading={googleLoading}
            disabled={isLoading || googleLoading}
          >
            Sign Up with Google
          </GoogleButton>
        </div>
      </div>
    </div>
  );
}
