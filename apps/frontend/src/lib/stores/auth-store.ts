import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, type LoginData, type RegisterData } from "../api/auth";

interface User {
  id: number;
  email: string;
}

interface AuthState {
  // State
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;

  // Initialize auth from stored token
  initialize: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      /**
       * Login user with email and password
       * @param data Login credentials
       * Sets user data and token on success, error message on failure
       */
      login: async (data: LoginData) => {
        set({ isLoading: true, error: null });

        try {
          await authApi.login(data);
          // After server sets cookie, fetch user profile
          const me = await authApi.me();
          set({
            user: { id: me.id, email: me.email },
            token: null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Login failed. Please try again.";
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error; // Re-throw for component handling
        }
      },

      /**
       * Register new user account
       * @param data Registration data (email, password)
       * Auto-logs in user on successful registration
       */
      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });

        try {
          await authApi.register(data);
          const me = await authApi.me();
          set({
            user: { id: me.id, email: me.email },
            token: null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Registration failed. Please try again.";
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error; // Re-throw for component handling
        }
      },

      /**
       * Logout current user
       * Calls backend logout endpoint and clears all auth state
       */
      logout: async () => {
        set({ isLoading: true });

        try {
          // Call backend logout endpoint
          await authApi.logout();
        } catch (error) {
          // Even if backend logout fails, we should clear local state
          console.warn("Backend logout failed:", error);
        } finally {
          // Clear session-scoped lesson filter keys to prevent cross-account leakage
          try {
            if (typeof window !== "undefined") {
              const LESSONS_KEYS = [
                "mandareen.lessons.mode.v1",
                "mandareen.lessons.hsk.v1",
                "mandareen.lessons.time.v1",
                "mandareen.lessons.tags.v1",
              ];
              for (const k of LESSONS_KEYS) {
                sessionStorage.removeItem(k);
              }
            }
          } catch {}
          // Always clear local auth state
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      /**
       * Clear error message
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Set loading state
       */
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      /**
       * Initialize auth state from stored token
       * Call this on app startup to restore authentication
       */
      initialize: async () => {
        set({ isLoading: true });
        try {
          const me = await authApi.me();
          set({
            user: { id: me.id, email: me.email },
            token: null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },
    }),
    {
      name: "auth-store", // localStorage key
      partialize: (state) => ({
        // Only persist user and authentication status
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
