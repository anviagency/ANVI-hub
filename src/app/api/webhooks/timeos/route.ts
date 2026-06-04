import { NextRequest, NextResponse } from "next/server";
import { getMeetingProvider } from "@/lib/meetings/provider";
import { ingestMeetingSummary } from "@/lib/meetings/ingest";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// POST /api/webhooks/timeos — TimeOS/Timeless "summary ready" webhook.
// Idempotent on the meeting id; attaches summary+video, advances pipeline,
// fires the client's screening-completed WhatsApp message.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`timeos:${getClientIp(req)}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const summary = getMeetingProvider().handleSummaryReadyWebhook(payload);
  if (!summary) return NextResponse.json({ error: "unparseable_payload" }, { status: 400 });

  try {
    const result = await ingestMeetingSummary(summary);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("timeos ingest failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
