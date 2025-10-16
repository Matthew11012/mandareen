export async function getAuthToken(): Promise<string | null> {
  // Server-side: prefer httpOnly cookie if present
  if (typeof window === "undefined") {
    try {
      const mod = await import("next/headers");
      const cookieStore = await mod.cookies();
      return cookieStore.get("auth-token")?.value ?? null;
    } catch {
      return null;
    }
  }
  // Client-side: rely on httpOnly cookies automatically sent with requests.
  // Do not use localStorage tokens to avoid account desync between SSR and CSR.
  return null;
}
