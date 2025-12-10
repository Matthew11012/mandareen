"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { useAuthStore } from "@/lib/stores/auth-store";
import { registerSchema, type RegisterData } from "@/lib/api/auth";
import { validatePassword } from "@/lib/utils";
import { useCheckoutMutation } from "@/lib/hooks/use-billing";
import { BillingPeriod } from "@/lib/api/billing";
import { signIn, signUp } from "@/lib/auth-client";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authStore = useAuthStore();
  const {
    isAuthenticated: authStoreIsAuthenticated,
    isLoading: authStoreIsLoading,
    clearError,
  } = authStore;
  const checkoutMutation = useCheckoutMutation();

  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const isProcessingCheckoutRef = useRef(false);

  const redirectUrl = searchParams.get("redirect");

  const planInfo = redirectUrl
    ? (() => {
        try {
          const urlParts = redirectUrl.split("?");
          if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            const plan = params.get("plan");
            const billingPeriod = params.get("billingPeriod");

            if (plan && ["BASIC", "PREMIUM"].includes(plan)) {
              return {
                planCode: plan as "BASIC" | "PREMIUM",
                billingPeriod:
                  (billingPeriod as BillingPeriod) || BillingPeriod.MONTHLY,
              };
            }
          }
        } catch (error) {
          console.error("Failed to parse redirect URL:", error);
        }
        return null;
      })()
    : null;

  useEffect(() => {
    const initialize = (
      authStore as unknown as { initialize?: () => Promise<void> }
    ).initialize;
    if (initialize) {
      void initialize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (redirectUrl) {
      return;
    }

    if (
      !authStoreIsLoading &&
      authStoreIsAuthenticated &&
      !isRegistering &&
      !isProcessingCheckout &&
      !isProcessingCheckoutRef.current
    ) {
      router.push("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authStoreIsLoading,
    authStoreIsAuthenticated,
    isRegistering,
    isProcessingCheckout,
    redirectUrl,
  ]);

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
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
  });

  const password = watch("password");
  const passwordValidation = password
    ? validatePassword(password)
    : { isValid: false, errors: [] };

  const handleCheckoutAfterSignup = async (
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
      console.error("Checkout error after signup:", error);
      setIsProcessingCheckout(false);
      isProcessingCheckoutRef.current = false;
      router.push(`/pricing?plan=${planCode}&billingPeriod=${billingPeriod}`);
    }
  };

  const onSubmit = async (data: RegisterData) => {
    try {
      clearError();

      setIsRegistering(true);

      if (planInfo) {
        setIsProcessingCheckout(true);
        isProcessingCheckoutRef.current = true;
      }

      const result = await signUp.email({
        email: data.email,
        password: data.password,
        name: data.username,
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Sign up failed");
      }

      if (!planInfo) {
        setIsRegistering(false);
      }

      toast.success("Account created. Welcome to Mandareen!");

      if (planInfo) {
        await handleCheckoutAfterSignup(
          planInfo.planCode,
          planInfo.billingPeriod
        );
      } else if (redirectUrl) {
        setIsRegistering(false);
        router.push(redirectUrl);
      } else {
        setIsRegistering(false);
        setIsProcessingCheckout(false);
        isProcessingCheckoutRef.current = false;
        router.push("/dashboard");
      }
    } catch (error) {
      setIsRegistering(false);
      setIsProcessingCheckout(false);
      isProcessingCheckoutRef.current = false;
      toast.error(
        error instanceof Error
          ? error.message
          : "Registration failed. Please try again."
      );
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setGoogleLoading(true);
      clearError();

      if (redirectUrl) {
        sessionStorage.setItem("signup_redirect_url", redirectUrl);
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
        throw new Error(response.error.message ?? "Google sign up failed");
      }

      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      setGoogleLoading(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to initiate Google sign up"
      );
    }
  };

  if (authStoreIsLoading || isRegistering || isProcessingCheckout) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" />
          {isProcessingCheckout ? (
            <>
              <p className="text-white font-inter font-semibold text-lg">
                Preparing your checkout...
              </p>
              <p className="text-[#a6a6a6] font-inter text-sm max-w-md mx-auto px-4">
                Please wait while we create your checkout session. You&apos;ll
                be redirected to complete your purchase in a moment.
              </p>
            </>
          ) : isRegistering ? (
            <>
              <p className="text-white font-inter font-semibold text-lg">
                Creating your account...
              </p>
              <p className="text-[#a6a6a6] font-inter text-sm max-w-md mx-auto px-4">
                Please wait while we set up your account.
              </p>
            </>
          ) : (
            <p className="text-white font-inter text-sm">Loading...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4 sm:py-8">
      <div className="w-full max-w-md">
        <div className="sm:bg-[#2a3039] sm:rounded-2xl sm:shadow-xl p-6 pb-2 sm:p-8">
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
              label="USERNAME"
              type="text"
              placeholder="Create your username"
              autoComplete="username"
              spellCheck={false}
              {...register("username")}
              error={errors.username?.message}
            />

            <Input
              label="PASSWORD"
              type={showPassword ? "text" : "password"}
              placeholder="Create a strong password"
              autoComplete="new-password"
              {...register("password")}
              error={password ? undefined : errors.password?.message}
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

            <AnimatePresence>
              {password && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-[#393e46] rounded-lg p-3 space-y-2 overflow-hidden"
                >
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                    className="text-white text-xs font-medium"
                  >
                    Password Requirements
                  </motion.p>
                  <ul className="space-y-1">
                    <motion.li
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.15 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <motion.div
                        key={password.length >= 8 ? "check" : "x"}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          duration: 0.2,
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                      >
                        {password.length >= 8 ? (
                          <Check
                            size={12}
                            className="text-green-400 transition-colors duration-300"
                          />
                        ) : (
                          <X
                            size={12}
                            className="text-red-400 transition-colors duration-300"
                          />
                        )}
                      </motion.div>
                      <motion.span
                        key={`length-${password.length >= 8}`}
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={
                          password.length >= 8
                            ? "text-green-400 transition-colors duration-300"
                            : "text-red-400 transition-colors duration-300"
                        }
                      >
                        At least 8 characters
                      </motion.span>
                    </motion.li>
                    <motion.li
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.2 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <motion.div
                        key={/[a-z]/.test(password) ? "check" : "x"}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          duration: 0.2,
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                      >
                        {/[a-z]/.test(password) ? (
                          <Check
                            size={12}
                            className="text-green-400 transition-colors duration-300"
                          />
                        ) : (
                          <X
                            size={12}
                            className="text-red-400 transition-colors duration-300"
                          />
                        )}
                      </motion.div>
                      <motion.span
                        key={`lowercase-${/[a-z]/.test(password)}`}
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={
                          /[a-z]/.test(password)
                            ? "text-green-400 transition-colors duration-300"
                            : "text-red-400 transition-colors duration-300"
                        }
                      >
                        One lowercase letter
                      </motion.span>
                    </motion.li>
                    <motion.li
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.25 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <motion.div
                        key={/[A-Z]/.test(password) ? "check" : "x"}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          duration: 0.2,
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                      >
                        {/[A-Z]/.test(password) ? (
                          <Check
                            size={12}
                            className="text-green-400 transition-colors duration-300"
                          />
                        ) : (
                          <X
                            size={12}
                            className="text-red-400 transition-colors duration-300"
                          />
                        )}
                      </motion.div>
                      <motion.span
                        key={`uppercase-${/[A-Z]/.test(password)}`}
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={
                          /[A-Z]/.test(password)
                            ? "text-green-400 transition-colors duration-300"
                            : "text-red-400 transition-colors duration-300"
                        }
                      >
                        One uppercase letter
                      </motion.span>
                    </motion.li>
                    <motion.li
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.3 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <motion.div
                        key={/\d/.test(password) ? "check" : "x"}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          duration: 0.2,
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                      >
                        {/\d/.test(password) ? (
                          <Check
                            size={12}
                            className="text-green-400 transition-colors duration-300"
                          />
                        ) : (
                          <X
                            size={12}
                            className="text-red-400 transition-colors duration-300"
                          />
                        )}
                      </motion.div>
                      <motion.span
                        key={`number-${/\d/.test(password)}`}
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={
                          /\d/.test(password)
                            ? "text-green-400 transition-colors duration-300"
                            : "text-red-400 transition-colors duration-300"
                        }
                      >
                        One number
                      </motion.span>
                    </motion.li>
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

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
              loading={isRegistering}
              disabled={
                isRegistering || googleLoading || !passwordValidation.isValid
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
              disabled={isRegistering || googleLoading}
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

export default function SignupPage() {
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
      <SignupPageContent />
    </Suspense>
  );
}
