import { createAuthClient } from "better-auth/react";

/**
 * Shared Better Auth client instance for the frontend.
 * Wraps commonly used helpers so pages/components can import from one place.
 */
const baseURL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:3000/api";

export const authClient = createAuthClient({
  baseURL: `${baseURL}`,
  default: {
    fetchOptions: {
      credentials: "include",
    },
  },
});

export const { useSession, signIn, signOut, signUp } = authClient;
