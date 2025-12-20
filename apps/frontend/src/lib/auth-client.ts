import { createAuthClient } from "better-auth/react";
import { useQuery } from "@tanstack/react-query";

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
  transport: "rest", // Use REST transport to match server endpoints (/auth/session instead of /auth/get-session)
  default: {
    fetchOptions: {
      credentials: "include",
    },
  },
});

// Simple shared cache to avoid duplicate /auth/session calls across store/hooks.
let cachedSessionPromise: Promise<
  Awaited<ReturnType<typeof authClient.getSession>>
> | null = null;
let cachedSessionExpiresAt = 0;
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchSessionCached() {
  const now = Date.now();
  if (cachedSessionPromise && cachedSessionExpiresAt > now) {
    return cachedSessionPromise;
  }
  cachedSessionPromise = authClient.getSession().finally(() => {
    cachedSessionExpiresAt = Date.now() + SESSION_TTL_MS;
  });
  return cachedSessionPromise;
}

export const { signIn, signOut, signUp } = authClient;

// Stable session hook backed by React Query to avoid repeated /auth/session polls.
export function useStableSession() {
  return useQuery({
    queryKey: ["better-auth", "session"],
    queryFn: async () => {
      const session = await fetchSessionCached();
      return session.data ?? null;
    },
    staleTime: SESSION_TTL_MS,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
