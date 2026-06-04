import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordDecision, ShareError } from "@/lib/share";

export const runtime = "nodejs";

const Body = z.object({
  candidateId: z.string().min(1),
  decision: z.enum(["approve", "reject", "request_interview"]),
  feedback: z.string().optional(),
});

// POST /api/share/:token/decision — PUBLIC client action (approve / reject /
// request interview). Authorized by the token; rejects candidates not on the link.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const result = await recordDecision(token, parsed.data.candidateId, parsed.data.decision, parsed.data.feedback);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ShareError) {
      const status = e.code === "not_found" ? 404 : e.code === "candidate_not_shared" ? 403 : 410;
      return NextResponse.json({ error: e.code }, { status });
    }
    console.error("decision failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
