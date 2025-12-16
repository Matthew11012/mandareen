import { createAuthClient } from "better-auth/react";

/**
 * Shared Better Auth client instance for the frontend.
 * Wraps commonly used helpers so pages/components can import from one place.
 */
// Use proxy path for Better Auth so cookies work correctly
// The Next.js rewrite will proxy /api/* to the backend without /api prefix
const apiBase = "/api";

export const authClient = createAuthClient({
  baseURL: `${apiBase}/auth`,
  default: {
    fetchOptions: {
      credentials: "include",
    },
  },
});

export const { useSession, signIn, signOut, signUp } = authClient;
