import { NextRequest, NextResponse } from "next/server";
import { resolveClientPackage } from "@/lib/package/build";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// GET /api/package/:token — PUBLIC, token-authorized, read-only. Returns the
// anonymized, client-safe package (no contact details / cost / notes / transcript).
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rl = rateLimit(`package-view:${getClientIp(req)}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const data = await resolveClientPackage(token);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data);
}
