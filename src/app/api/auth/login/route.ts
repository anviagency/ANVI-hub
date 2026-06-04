import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie, toSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Throttle brute-force: 10 attempts / 5 min / IP.
  const rl = rateLimit(`login:${ip}`, 10, 5 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const ok = user && user.active && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !ok) {
    await audit({ actorType: "system", action: "login_failed", entity: "user", meta: { email: parsed.data.email }, ip });
    // Generic message — don't reveal whether the email exists.
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
  await audit({ userId: user.id, action: "login", entity: "user", entityId: user.id, ip });

  const res = NextResponse.json({ user: toSessionUser(user) });
  setSessionCookie(res, token, expiresAt);
  return res;
}
