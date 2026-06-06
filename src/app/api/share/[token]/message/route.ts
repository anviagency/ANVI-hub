import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertSharedCandidate, ShareError } from "@/lib/share";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

const Body = z.object({
  candidateId: z.string().min(1),
  kind: z.enum(["question", "reschedule_request"]).default("question"),
  body: z.string().min(1).max(2000),
});

// POST /api/share/:token/message — PUBLIC. Minimal client free-text so the
// workflow never dead-ends (Mission 8 Phase 4): "ask a question" / "request
// another time". Persists the message, drops a timeline event, and notifies the
// recruiter. Token-authorized + rate-limited. NOT a full inbox.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(req);
  const rl = rateLimit(`share-message:${ip}`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const { jobId, clientId } = await assertSharedCandidate(token, parsed.data.candidateId);
    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: parsed.data.candidateId }, select: { fullName: true } }),
      prisma.job.findUnique({ where: { id: jobId }, select: { title: true } }),
    ]);

    const message = await prisma.clientMessage.create({
      data: { clientId: clientId ?? null, jobId, candidateId: parsed.data.candidateId, kind: parsed.data.kind, body: parsed.data.body, via: "share_link" },
    });

    await prisma.candidateEvent.create({
      data: {
        candidateId: parsed.data.candidateId,
        jobId,
        clientId: clientId ?? null,
        type: "client_message",
        actor: "client",
        meta: { messageId: message.id, kind: parsed.data.kind, body: parsed.data.body.slice(0, 500) },
      },
    });

    const label = parsed.data.kind === "reschedule_request" ? "requested another time" : "asked a question";
    await notify({
      channel: "recruiter",
      title: `Client ${label}: ${candidate?.fullName ?? "candidate"}`,
      body: `${job?.title ?? "Role"} — "${parsed.data.body.slice(0, 240)}"`,
      jobId,
      candidateId: parsed.data.candidateId,
    });
    await audit({ actorType: "client", action: "client_message", entity: "client_message", entityId: message.id, meta: { jobId, kind: parsed.data.kind }, ip });

    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (e) {
    if (e instanceof ShareError) {
      const status = e.code === "not_found" ? 404 : e.code === "candidate_not_shared" ? 403 : 410;
      return NextResponse.json({ error: e.code }, { status });
    }
    console.error("share message failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
