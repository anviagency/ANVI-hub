import { NextRequest } from "next/server";

// Request helpers: client IP + same-origin (CSRF) check. Mission 3.5 P1.

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Same-origin check for cookie-authenticated mutations (CSRF mitigation).
 * Allows requests whose Origin (or Referer) host matches the request Host.
 * Requests with no Origin/Referer (e.g. server-to-server, curl) are allowed only
 * when they are not browser cross-site — we treat missing headers as same-origin
 * because browsers always send Origin on cross-site state-changing fetches.
 */
export function checkSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin) {
    // No Origin header: not a browser cross-site request. Fall back to Referer if present.
    const referer = req.headers.get("referer");
    if (!referer) return true;
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
