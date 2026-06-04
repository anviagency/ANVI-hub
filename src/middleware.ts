import { NextRequest, NextResponse } from "next/server";

// Keep this literal in sync with SESSION_COOKIE in src/lib/auth/session.ts.
// Inlined (not imported) so the edge middleware bundle stays free of node:crypto/Prisma.
const SESSION_COOKIE = "anvi_session";

// Defense-in-depth (Mission 3.5 P1): redirect unauthenticated BROWSER navigation
// to /login. Real enforcement is in the API route guards; this only improves UX
// and avoids flashing the app shell. Cheap cookie-presence check (no DB on edge).
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect the recruiter app only. Public: /login, /share/*, /api/*, static assets.
  matcher: ["/((?!login|share|api|_next/static|_next/image|favicon.ico|assets).*)"],
};
