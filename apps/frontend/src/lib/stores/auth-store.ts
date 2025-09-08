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
  logout: () => void;
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

          // Store token in localStorage for persistence
          localStorage.setItem("auth-token", response.token);

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
       * Clears all auth state and removes stored token
       */
      logout: () => {
        localStorage.removeItem("auth-token");
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
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
          // In a real app, you'd validate the token with the server
          // For now, we'll assume it's valid if it exists
          set({
            token,
            isAuthenticated: true,
            // Note: User data would need to be fetched from server
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
