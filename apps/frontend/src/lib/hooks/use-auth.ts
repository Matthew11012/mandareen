import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "../stores/auth-store";

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

  const router = useRouter();

  /**
   * Login and redirect to dashboard on success
   */
  const loginWithRedirect = async (data: Parameters<typeof login>[0]) => {
    try {
      await login(data);

      // Force a page refresh to ensure middleware picks up the cookie
      // This is more reliable than router.push for initial authentication
      window.location.href = "/dashboard";
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
      router.push("/auth");
    } catch (error) {
      // Even if logout fails, redirect to login
      console.error("Logout error:", error);
      router.push("/auth");
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login: loginWithRedirect,
    register: registerWithRedirect,
    logout: logoutWithRedirect,
    clearError,
  };
};

/**
 * Hook to protect routes that require authentication
 * Redirects to login if not authenticated
 */
export const useRequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, isLoading, router]);

  return { isAuthenticated, isLoading };
};

/**
 * Hook to redirect authenticated users away from auth pages
 * Use on login/register pages to prevent access when already logged in
 */
export const useRedirectAuthenticated = () => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  return { isAuthenticated, isLoading };
};
