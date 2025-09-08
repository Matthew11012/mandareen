import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  authApi,
  type AuthResponse,
  type LoginData,
  type RegisterData,
} from "../api/auth";

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
      isLoading: false,
      error: null,

      /**
       * Login user with email and password
       * @param data Login credentials
       * Sets user data and token on success, error message on failure
       */
      login: async (data: LoginData) => {
        set({ isLoading: true, error: null });

        try {
          const response: AuthResponse = await authApi.login(data);

          // Store token in localStorage and cookies for persistence
          localStorage.setItem("auth-token", response.token);
          document.cookie = `auth-token=${response.token}; path=/; max-age=86400; SameSite=Lax`;

          set({
            user: response.user,
            token: response.token,
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
          const response: AuthResponse = await authApi.register(data);

          // Store token and auto-login after registration
          localStorage.setItem("auth-token", response.token);
          document.cookie = `auth-token=${response.token}; path=/; max-age=86400; SameSite=Lax`;

          set({
            user: response.user,
            token: response.token,
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
          // Always clear local auth state
          localStorage.removeItem("auth-token");
          // Clear cookie as well
          document.cookie =
            "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
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
      initialize: () => {
        const token = localStorage.getItem("auth-token");
        if (token) {
          try {
            // Decode JWT to extract user data
            const base64Url = token.split(".")[1];
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            // Add padding if needed
            const paddedBase64 =
              base64 + "=".repeat((4 - (base64.length % 4)) % 4);
            const payload = JSON.parse(window.atob(paddedBase64));

            // Check if token is expired
            if (payload.exp && Date.now() >= payload.exp * 1000) {
              // Token expired, clear it
              localStorage.removeItem("auth-token");
              document.cookie =
                "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
              set({
                user: null,
                token: null,
                isAuthenticated: false,
                isLoading: false,
                error: null,
              });
              return;
            }

            // Set auth state with decoded user data
            set({
              user: {
                id: payload.sub,
                email: payload.email,
              },
              token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            // Invalid token, clear it
            console.error("Invalid token:", error);
            localStorage.removeItem("auth-token");
            document.cookie =
              "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          }
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
