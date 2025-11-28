"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { useAuth, useRedirectAuthenticated } from "@/lib/hooks/use-auth";
import {
  loginSchema,
  registerSchema,
  type LoginData,
  type RegisterData,
} from "@/lib/api/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "@/lib/auth-client";

const DURATION = 0.36;
const EASE: number[] = [0.2, 0.8, 0.2, 1];

function CombinedAuthContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initialMode = (params.get("mode") === "signup" ? "signup" : "login") as
    | "login"
    | "signup";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const { login, register: registerUser, isLoading, clearError } = useAuth();
  const { isLoading: authLoading } = useRedirectAuthenticated();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Forms
  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const signupSchema = registerSchema
    .extend({
      confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

  const signupForm = useForm<RegisterData & { confirmPassword: string }>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
    mode: "onChange",
  });

  // Merge refs: keep RHF registration and local focus refs
  const { ref: loginEmailRef, ...loginEmailReg } = loginForm.register("email");
  const { ref: signupEmailRef, ...signupEmailReg } =
    signupForm.register("email");

  // Because we can't easily extend zod schema here without import cycle, do a simple confirm check on submit
  const onLogin = async (data: LoginData) => {
    try {
      clearError();
      await login(data);
      toast.success("Welcome back!");
    } catch {
      toast.error("Login failed. Please check your credentials.");
    }
  };

  const onSignup = async (data: RegisterData & { confirmPassword: string }) => {
    try {
      clearError();
      // Only send required fields to backend
      await registerUser({ email: data.email, password: data.password });
      toast.success("Welcome to Mandareen! Your account has been created.");
    } catch {
      toast.error("Registration failed. Please try again.");
    }
  };

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      clearError();

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
          : "Failed to initiate Google sign in"
      );
    }
  };

  // Focus management after toggle
  const loginFirstInputRef = useRef<HTMLInputElement | null>(null);
  const signupFirstInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (mode === "login") loginFirstInputRef.current?.focus();
        else signupFirstInputRef.current?.focus();
      },
      prefersReducedMotion ? 0 : 160
    );
    return () => clearTimeout(timer);
  }, [mode, prefersReducedMotion]);

  // Track viewport to render only one form set to avoid double registration
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = (next: "login" | "signup") => {
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    router.replace(url.toString());
  };

  // Animations
  const formVariants = {
    initial: (dir: number) => ({
      opacity: 0,
      x: 24 * dir,
      filter: "blur(6px)",
    }),
    animate: {
      opacity: 1,
      x: 0,
      filter: "blur(0px)",
      transition: { duration: DURATION, ease: EASE },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: -24 * dir,
      filter: "blur(6px)",
      transition: { duration: DURATION, ease: EASE },
    }),
  } as const;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-primary-bg)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-primary-bg)] text-[var(--color-text-primary)] px-4 py-16">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header with Brand and Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">普</span>
              </div>
              <span className="font-inter font-semibold">Mandareen</span>
            </Link>
          </div>
          <div
            role="tablist"
            aria-label="Auth mode"
            className="bg-[var(--color-surface-2)] rounded-full p-1 flex"
          >
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => toggle(m)}
                className={`px-4 py-1.5 text-sm rounded-full transition-colors ${mode === m ? "bg-[var(--color-accent-blue)] text-white" : "text-[var(--color-text-secondary)] hover:text-white cursor-pointer"}`}
              >
                {m === "login" ? "Login" : "Sign up"}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: Horizontal card with sliding panes (rendered only on desktop) */}
        {isDesktop ? (
          <div className="block">
            <div className="relative h-[640px] rounded-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] overflow-hidden p-8">
              {/* Form pane moves left/right */}
              <motion.div
                className="absolute inset-y-0 left-0 w-1/2 p-8 flex items-center justify-center"
                animate={{ x: mode === "login" ? "0%" : "100%" }}
                transition={{ duration: DURATION, ease: EASE }}
              >
                <div className="w-full max-w-sm rounded-xl border border-[var(--color-surface-2)] bg-[var(--color-primary-bg)]/60 backdrop-blur p-6  overflow-y-auto">
                  <AnimatePresence
                    mode="wait"
                    initial={false}
                    custom={mode === "login" ? 1 : -1}
                  >
                    {mode === "login" ? (
                      <motion.div
                        key="login"
                        custom={1}
                        variants={formVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="space-y-6"
                      >
                        <h1 className="font-inter text-3xl font-extrabold">
                          Welcome back
                        </h1>
                        <form
                          onSubmit={loginForm.handleSubmit(onLogin)}
                          className="space-y-5"
                        >
                          <Input
                            label="EMAIL"
                            type="email"
                            placeholder="you@example.com"
                            {...loginEmailReg}
                            ref={(el) => {
                              loginEmailRef(el);
                              loginFirstInputRef.current = el;
                            }}
                            error={loginForm.formState.errors.email?.message}
                          />
                          <Input
                            label="PASSWORD"
                            type={showPassword ? "text" : "password"}
                            placeholder="password"
                            {...loginForm.register("password")}
                            error={loginForm.formState.errors.password?.message}
                            icon={
                              <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="hover:text-white cursor-pointer"
                              >
                                {showPassword ? (
                                  <EyeOff size={16} />
                                ) : (
                                  <Eye size={16} />
                                )}
                              </button>
                            }
                          />
                          <Button
                            type="submit"
                            size="full"
                            variant="primary"
                            loading={isLoading}
                            disabled={isLoading || googleLoading}
                          >
                            Sign in
                          </Button>
                          <div className="relative">
                            <div
                              className="absolute inset-0 flex items-center"
                              aria-hidden="true"
                            >
                              <div className="w-full border-t border-[var(--color-border)]/30" />
                            </div>
                            <div className="relative flex justify-center">
                              <span className="bg-[var(--color-surface-1)] px-2 text-[var(--color-text-secondary)] text-xs font-inter">
                                or
                              </span>
                            </div>
                          </div>
                          <GoogleButton
                            type="button"
                            loading={googleLoading}
                            onClick={handleGoogle}
                            disabled={isLoading || googleLoading}
                          />
                        </form>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="signup"
                        custom={-1}
                        variants={formVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="space-y-6"
                      >
                        <h1 className="font-inter text-3xl font-extrabold">
                          Create your account
                        </h1>
                        <form
                          onSubmit={signupForm.handleSubmit(onSignup)}
                          className="space-y-5"
                        >
                          <Input
                            label="EMAIL"
                            type="email"
                            placeholder="you@example.com"
                            {...signupEmailReg}
                            ref={(el) => {
                              signupEmailRef(el);
                              signupFirstInputRef.current = el;
                            }}
                            error={signupForm.formState.errors.email?.message}
                          />
                          <Input
                            label="PASSWORD"
                            type={showPassword ? "text" : "password"}
                            placeholder="password"
                            {...signupForm.register("password")}
                            error={
                              signupForm.formState.errors.password?.message
                            }
                            icon={
                              <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="hover:text-white cursor-pointer"
                              >
                                {showPassword ? (
                                  <EyeOff size={16} />
                                ) : (
                                  <Eye size={16} />
                                )}
                              </button>
                            }
                          />
                          <Input
                            label="CONFIRM PASSWORD"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="confirm password"
                            {...signupForm.register("confirmPassword")}
                            error={
                              signupForm.formState.errors.confirmPassword
                                ?.message
                            }
                            icon={
                              <button
                                type="button"
                                onClick={() =>
                                  setShowConfirmPassword((v) => !v)
                                }
                                className="hover:text-white cursor-pointer"
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
                            size="full"
                            variant="primary"
                            loading={isLoading}
                            disabled={isLoading || googleLoading}
                          >
                            Create account — free
                          </Button>
                          <div className="relative">
                            <div
                              className="absolute inset-0 flex items-center"
                              aria-hidden="true"
                            >
                              <div className="w-full border-t border-[var(--color-border)]/30" />
                            </div>
                            <div className="relative flex justify-center">
                              <span className="bg-[var(--color-surface-1)] px-2 text-[var(--color-text-secondary)] text-xs font-inter">
                                or
                              </span>
                            </div>
                          </div>
                          <GoogleButton
                            type="button"
                            loading={googleLoading}
                            onClick={handleGoogle}
                            disabled={isLoading || googleLoading}
                          >
                            Sign up with Google
                          </GoogleButton>
                        </form>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>

              {/* Visual pane moves opposite */}
              <motion.div
                className="absolute inset-y-0 left-0 w-1/2 p-8 flex items-center justify-center"
                animate={{ x: mode === "login" ? "100%" : "0%" }}
                transition={{ duration: DURATION, ease: EASE }}
              >
                <div className="text-center max-w-sm">
                  <svg
                    width="240"
                    height="120"
                    viewBox="0 0 240 120"
                    className="mx-auto"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#4040f2" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                    <rect
                      x="0"
                      y="20"
                      width="240"
                      height="80"
                      rx="16"
                      fill="url(#g)"
                      opacity="0.18"
                    />
                    <circle cx="60" cy="60" r="20" fill="#fff" opacity="0.25" />
                    <circle
                      cx="180"
                      cy="60"
                      r="20"
                      fill="#fff"
                      opacity="0.25"
                    />
                    <text
                      x="120"
                      y="68"
                      textAnchor="middle"
                      fill="#c6ceff"
                      fontSize="14"
                    >
                      Mandareen
                    </text>
                  </svg>
                  <p className="mt-6 text-[var(--color-text-secondary)] font-inter">
                    {mode === "login"
                      ? "New here? Create an account to get started."
                      : "Already have an account? Sign in to continue."}
                  </p>
                  <div className="mt-4">
                    <Link
                      href={`?mode=${mode === "login" ? "signup" : "login"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        toggle(mode === "login" ? "signup" : "login");
                      }}
                      className="text-[#9aa6ff] hover:text-white underline-offset-4 hover:underline font-inter"
                    >
                      {mode === "login" ? "Create an account" : "Sign in"}
                    </Link>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        ) : null}

        {/* Mobile: stacked form then small visual (rendered only on mobile) */}
        {!isDesktop ? (
          <div className="space-y-6">
            <AnimatePresence
              mode="wait"
              initial={false}
              custom={mode === "login" ? 1 : -1}
            >
              {mode === "login" ? (
                <motion.div
                  key="login-m"
                  custom={1}
                  variants={formVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <form
                    onSubmit={loginForm.handleSubmit(onLogin)}
                    className="space-y-5"
                  >
                    <Input
                      label="EMAIL"
                      type="email"
                      placeholder="you@example.com"
                      {...loginEmailReg}
                      ref={(el) => {
                        loginEmailRef(el);
                        loginFirstInputRef.current = el;
                      }}
                      error={loginForm.formState.errors.email?.message}
                    />
                    <Input
                      label="PASSWORD"
                      type={showPassword ? "text" : "password"}
                      placeholder="password"
                      {...loginForm.register("password")}
                      error={loginForm.formState.errors.password?.message}
                      icon={
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="hover:text-white cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      }
                    />
                    <Button
                      type="submit"
                      size="full"
                      variant="primary"
                      loading={isLoading}
                      disabled={isLoading || googleLoading}
                    >
                      Sign in
                    </Button>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="signup-m"
                  custom={-1}
                  variants={formVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <form
                    onSubmit={signupForm.handleSubmit(onSignup)}
                    className="space-y-5"
                  >
                    <Input
                      label="EMAIL"
                      type="email"
                      placeholder="you@example.com"
                      {...signupEmailReg}
                      ref={(el) => {
                        signupEmailRef(el);
                        signupFirstInputRef.current = el;
                      }}
                      error={signupForm.formState.errors.email?.message}
                    />
                    <Input
                      label="PASSWORD"
                      type={showPassword ? "text" : "password"}
                      placeholder="password"
                      {...signupForm.register("password")}
                      error={signupForm.formState.errors.password?.message}
                      icon={
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="hover:text-white cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      }
                    />
                    <Input
                      label="CONFIRM PASSWORD"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="confirm password"
                      {...signupForm.register("confirmPassword")}
                      error={
                        signupForm.formState.errors.confirmPassword?.message
                      }
                      icon={
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="hover:text-white cursor-pointer"
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
                      size="full"
                      variant="primary"
                      loading={isLoading}
                      disabled={isLoading || googleLoading}
                    >
                      Create account — free
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="rounded-xl border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] p-6 text-center">
              <svg
                width="200"
                height="100"
                viewBox="0 0 240 120"
                className="mx-auto"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="gm" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#4040f2" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <rect
                  x="0"
                  y="20"
                  width="240"
                  height="80"
                  rx="16"
                  fill="url(#gm)"
                  opacity="0.18"
                />
              </svg>
              <div className="mt-2">
                <Link
                  href={`?mode=${mode === "login" ? "signup" : "login"}`}
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(mode === "login" ? "signup" : "login");
                  }}
                  className="text-[#9aa6ff] hover:text-white underline-offset-4 hover:underline font-inter"
                >
                  {mode === "login" ? "Create an account" : "Sign in"}
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CombinedAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--color-primary-bg)] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      }
    >
      <CombinedAuthContent />
    </Suspense>
  );
}
