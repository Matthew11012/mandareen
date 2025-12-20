import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that should bypass auth checks
  const PUBLIC_PATHS = [
    "/",
    "/login",
    "/register",
    "/auth",
    "/api/auth",
    "/manifest.json",
  ];

  const isPublic = (() => {
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/static") ||
      pathname.startsWith("/icons") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/assets")
    ) {
      return true;
    }
    return PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
  })();

  if (isPublic) {
    return NextResponse.next();
  }

  // Better Auth cookie prefix from server config: cookiePrefix: 'mandareen'
  // If we cannot see a session cookie on this origin (e.g., auth cookies scoped
  // to API domain), do not block; client-side will handle auth. This avoids
  // redirect loops when cookies are not visible at the edge.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
