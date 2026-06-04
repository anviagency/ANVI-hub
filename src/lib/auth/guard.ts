import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { getSessionUser, SessionUser } from "@/lib/auth/session";
import { checkSameOrigin } from "@/lib/security/request";

// Authorization guard for API routes (Mission 3.5 P1).
// `authenticate` returns the user or a ready-to-return error response.

export type AuthOutcome = { ok: true; user: SessionUser } | { ok: false; response: NextResponse };

export async function authenticate(req: NextRequest, roles?: Role[]): Promise<AuthOutcome> {
  const user = await getSessionUser(req);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, user };
}

/**
 * Guard a state-changing request: require auth (+ optional roles) AND a same-origin
 * request (CSRF mitigation for cookie auth). Use at the top of every mutation route.
 */
export async function authorizeMutation(req: NextRequest, roles?: Role[]): Promise<AuthOutcome> {
  if (!checkSameOrigin(req)) {
    return { ok: false, response: NextResponse.json({ error: "bad_origin" }, { status: 403 }) };
  }
  return authenticate(req, roles);
}

export const RECRUITER_ROLES: Role[] = ["recruiter", "admin"];
export const ADMIN_ROLES: Role[] = ["admin"];
