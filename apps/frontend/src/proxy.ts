import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

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
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  })();

  if (isPublic) {
    return NextResponse.next();
  }

  // Better Auth cookie prefix from server config: cookiePrefix: 'mandareen'
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("mandareen.session"));

  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/login") {
    loginUrl.searchParams.set("redirect", pathname + search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
