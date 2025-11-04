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
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get token from cookies or authorization header
  const token = request.cookies.get("auth-token")?.value;

  // Define protected routes that require authentication
  const protectedRoutes = [
    "/dashboard",
    "/lessons",
    "/flashcards",
    "/conversations",
  ];
  // Note: We intentionally do not force-redirect authenticated users off auth pages to preserve refresh behavior.

  // Check if the current path is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  // const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));

  // Handle protected routes
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

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
