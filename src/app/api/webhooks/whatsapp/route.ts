import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import { handleWhatsAppInbound } from "@/lib/whatsapp/inbound";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// GET — Meta webhook verification handshake (hub.challenge echo).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const challenge = getWhatsAppProvider().verifyWebhook({
    mode: sp.get("hub.mode") ?? undefined,
    token: sp.get("hub.verify_token") ?? undefined,
    challenge: sp.get("hub.challenge") ?? undefined,
  });
  if (challenge === null) return NextResponse.json({ error: "verification_failed" }, { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

// POST — inbound messages (button taps → client decisions). Idempotent + rate-limited.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`wa-inbound:${getClientIp(req)}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    const result = await handleWhatsAppInbound(payload, getClientIp(req));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("wa inbound failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
