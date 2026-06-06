import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveCandidateAccess, recordCandidateAction, CandidateAccessError } from "@/lib/candidate-access";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

function statusFor(code: CandidateAccessError["code"]): number {
  if (code === "not_found" || code === "candidate_not_found") return 404;
  if (code === "expired") return 410;
  if (code === "no_interview") return 409;
  return 400;
}

// GET /api/candidate/:token — PUBLIC. The candidate's own minimal self-view.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rl = rateLimit(`cand-view:${getClientIp(req)}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    return NextResponse.json(await resolveCandidateAccess(token));
  } catch (e) {
    if (e instanceof CandidateAccessError) return NextResponse.json({ error: e.code }, { status: statusFor(e.code) });
    console.error("candidate access resolve failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

const Action = z.object({
  action: z.enum(["confirm_availability", "decline_availability", "confirm_interview", "request_reschedule"]),
  message: z.string().max(1000).optional(),
});

// POST /api/candidate/:token — PUBLIC. The candidate confirms/declines availability
// or responds to an interview invite. Token-authorized + rate-limited.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(req);
  const rl = rateLimit(`cand-act:${ip}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const result = await recordCandidateAction(token, parsed.data.action, parsed.data.message, ip);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof CandidateAccessError) return NextResponse.json({ error: e.code }, { status: statusFor(e.code) });
    console.error("candidate action failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
