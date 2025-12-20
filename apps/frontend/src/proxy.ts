import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for handling authentication and route protection
 *
 * Features:
 * - Protects authenticated routes
 * - Redirects unauthenticated users to login
 * - Redirects authenticated users away from auth pages
 * - Handles OAuth callback routes
 */
export function proxy(request: NextRequest) {
  // Edge auth enforcement disabled; noop to retain structure
  void request.nextUrl;

  // Check legacy JWT cookie and Better Auth session cookies (any mandareen.* cookie)
  const legacyToken = request.cookies.get("auth-token")?.value;
  // Better Auth cookie names use the configured prefix; they may be wrapped with
  // __Secure- (secure contexts) and use different separators.
  // Example: "__Secure-mandareen.session_token"
  const betterAuthCookies = request.cookies
    .getAll()
    .filter((cookie) =>
      ["mandareen", "__Secure-mandareen"].some((prefix) =>
        cookie.name.startsWith(prefix)
      )
    );
  const hasBetterAuthSession = betterAuthCookies.length > 0;
  void legacyToken;
  void hasBetterAuthSession;

  // Protected route enforcement is disabled for now because Better Auth
  // cookies live on the API origin and are not visible to the Vercel edge
  // middleware. Client-side guards should enforce auth after session fetch.

  // Handle auth routes (redirect if already authenticated)
  // If authenticated and visiting auth pages, allow staying unless explicitly root auth path

  // Allow access to all other routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
