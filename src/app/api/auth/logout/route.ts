import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, destroySession, clearSessionCookie, getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) await audit({ userId: user.id, action: "logout", entity: "user", entityId: user.id });
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
