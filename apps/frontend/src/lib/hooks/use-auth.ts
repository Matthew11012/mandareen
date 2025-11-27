import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "../stores/auth-store";
import { useSession } from "../auth-client";

/**
 * Custom hook for authentication logic
 * Provides convenient methods for auth operations
 */
export const useAuth = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
  } = useAuthStore();
  const { data: baSession, isPending: baPending } = useSession();

  const router = useRouter();

  /**
   * Login and redirect to dashboard on success
   */
  const loginWithRedirect = async (data: Parameters<typeof login>[0]) => {
    try {
      await login(data);

      // Smooth client-side navigation; middleware runs on route change
      router.replace("/dashboard");
    } catch {
      // Error is handled by the store, component can show it
    }
  };

  /**
   * Register and redirect to dashboard on success
   */
  const registerWithRedirect = async (data: Parameters<typeof register>[0]) => {
    try {
      await register(data);
      router.push("/dashboard");
    } catch {
      // Error is handled by the store, component can show it
    }
  };

  /**
   * Logout and redirect to login page
   */
  const logoutWithRedirect = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      // Even if logout fails, redirect to login
      console.error("Logout error:", error);
      router.push("/login");
    }
  };

  return {
    user: baSession?.user ?? user,
    isAuthenticated: Boolean(baSession?.user) || isAuthenticated,
    isLoading: isLoading || baPending,
    error,
    login: loginWithRedirect,
    register: registerWithRedirect,
    logout: logoutWithRedirect,
    clearError,
    authSource: baSession?.user ? "better-auth" : "legacy",
  };
};

/**
 * Hook to protect routes that require authentication
 * Redirects to login if not authenticated
 */
export const useRequireAuth = () => {
  const store = useAuthStore();
  const { isAuthenticated, isLoading } = store;
  const initialize = (store as unknown as { initialize?: () => void })
    .initialize;
  const router = useRouter();

  useEffect(() => {
    // Ensure auth state is restored from token on first load
    initialize?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Only decide redirect after initialize() completes
    if (isLoading) return;
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, isLoading, router]);

  return { isAuthenticated, isLoading };
};

/**
 * Hook to redirect authenticated users away from auth pages
 * Use on login/register pages to prevent access when already logged in
 */
export const useRedirectAuthenticated = () => {
  const store = useAuthStore();
  const { isAuthenticated, isLoading } = store;
  const initialize = (store as unknown as { initialize?: () => void })
    .initialize;
  const router = useRouter();
  const { data: baSession, isPending: baPending } = useSession();

  // Ensure auth state is restored from token on first load of auth pages
  useEffect(() => {
    initialize?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoading || baPending) return;
    if (baSession?.user || isAuthenticated) {
      router.push("/dashboard");
    }
  }, [baSession?.user, baPending, isAuthenticated, isLoading, router]);

  return {
    isAuthenticated: Boolean(baSession?.user) || isAuthenticated,
    isLoading: isLoading || baPending,
  };
};
