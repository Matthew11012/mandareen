import { createAuthClient } from "better-auth/react";

/**
 * Shared Better Auth client instance for the frontend.
 * Wraps commonly used helpers so pages/components can import from one place.
 */
function normalizeAuthBaseUrl(): string {
  const rawBase =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";
  const trimmed = rawBase.replace(/\/$/, "");
  return `${trimmed}/auth`;
}

const authBaseURL = normalizeAuthBaseUrl();

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  default: {
    fetchOptions: {
      credentials: "include",
    },
  },
});

export const { useSession, signIn, signOut, signUp } = authClient;
