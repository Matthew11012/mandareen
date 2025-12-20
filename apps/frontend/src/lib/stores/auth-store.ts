import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, type LoginData, type RegisterData } from "../api/auth";
import { authClient, signIn, signUp } from "../auth-client";

interface User {
  id: number;
  email: string;
  username: string;
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
  setUser: (partial: Partial<User>) => void;

  // Initialize auth from stored token
  initialize: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => {
      let initPromise: Promise<void> | null = null;
      let hasInitialized = false;

      return {
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
            const result = await signIn.email({
              email: data.email,
              password: data.password,
            });
            if (result.error) {
              throw new Error(result.error.message ?? "Login failed");
            }

            const me = await authApi.me();
            set({
              user: {
                id: me.id,
                email: me.email,
                username: me.username ?? me.email?.split("@")[0] ?? "",
              },
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
            const result = await signUp.email({
              email: data.email,
              password: data.password,
              name: data.email.split("@")[0] ?? data.email,
            });
            if (result.error) {
              throw new Error(result.error.message ?? "Registration failed");
            }

            const me = await authApi.me();
            set({
              user: {
                id: me.id,
                email: me.email,
                username: me.username ?? me.email?.split("@")[0] ?? "",
              },
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

          const backendBase =
            process.env.NEXT_PUBLIC_BACKEND_URL ||
            process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:3000";
          const signOutEndpoint = `${backendBase.replace(/\/$/, "")}/auth/sign-out`;

          try {
            // Prefer Better Auth sign-out to revoke the current session cookies
            await authClient.signOut();
          } catch (error) {
            console.warn("Better Auth sign-out failed, falling back:", error);
            try {
              await authApi.logout();
            } catch (legacyError) {
              console.warn("Legacy logout failed:", legacyError);
            }
          } finally {
            // Always force backend sign-out to clear Better Auth cookies
            try {
              await fetch(signOutEndpoint, {
                method: "POST",
                credentials: "include",
              });
            } catch (finalError) {
              console.warn("Force /auth/sign-out failed:", finalError);
            }
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
         * Merge user fields (e.g., username updates)
         */
        setUser: (partial: Partial<User>) => {
          set((state) => ({
            user: state.user ? { ...state.user, ...partial } : state.user,
          }));
        },

        /**
         * Initialize auth state from stored token
         * Call this on app startup to restore authentication
         */
        initialize: async () => {
          if (hasInitialized) {
            set((state) => ({ ...state, isLoading: false }));
            return;
          }

          if (!initPromise) {
            initPromise = (async () => {
              set({ isLoading: true });
              try {
                const session = await authClient.getSession();
                if (session.data?.user) {
                  const me = await authApi.me();
                  set({
                    user: {
                      id: me.id,
                      email: me.email,
                      username: me.username ?? me.email?.split("@")[0] ?? "",
                    },
                    token: null,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null,
                  });
                  return;
                }
              } catch (error) {
                console.warn("Better Auth session lookup failed:", error);
              }

              try {
                const me = await authApi.me();
                set({
                  user: {
                    id: me.id,
                    email: me.email,
                    username: me.username ?? me.email?.split("@")[0] ?? "",
                  },
                  token: null,
                  isAuthenticated: true,
                  isLoading: false,
                  error: null,
                });
                return;
              } catch {
                set({
                  user: null,
                  token: null,
                  isAuthenticated: false,
                  isLoading: false,
                  error: null,
                });
              }
            })();
          }

          await initPromise;
          hasInitialized = true;
        },
      };
    },
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
