import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertSharedCandidate, ShareError } from "@/lib/share";
import { applyStage } from "@/lib/pipeline";
import { resolveMeetingUrl } from "@/lib/meetings/links";
import { scheduleInterviewReminders } from "@/lib/reminders";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

const Body = z.object({
  candidateId: z.string().min(1),
  scheduledFor: z.string().datetime(),
  timezone: z.string().optional(),
});

// POST /api/share/:token/schedule — PUBLIC. The CLIENT picks an interview time.
// If the recruiter proposed slots, the client's pick fills that proposed interview;
// otherwise a new interview is created. No fake meeting link is ever fabricated
// (Mission 8 Phase 1) — a real link is added when a provider is configured or the
// recruiter pastes one. Token-authorized + rate-limited.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(req);
  const rl = rateLimit(`share-schedule:${ip}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const { jobId } = await assertSharedCandidate(token, parsed.data.candidateId);
    const when = new Date(parsed.data.scheduledFor);

    // Reuse a recruiter-proposed (or otherwise open) interview if one exists.
    const open = await prisma.interview.findFirst({
      where: { candidateId: parsed.data.candidateId, jobId, status: { in: ["proposed", "scheduled", "rescheduled"] } },
      orderBy: { createdAt: "desc" },
    });

    let interviewId: string;
    let meetingUrl: string | null;
    if (open) {
      const link = resolveMeetingUrl({ provided: open.meetingUrl ?? undefined, provider: (open.meetingProvider as "google_meet" | "zoom" | "teams" | null) ?? undefined });
      const updated = await prisma.interview.update({
        where: { id: open.id },
        data: {
          scheduledFor: when,
          status: "scheduled",
          timezone: parsed.data.timezone ?? open.timezone ?? "UTC",
          meetingUrl: link.url,
          meetingProvisioned: link.provisioned,
          candidateStatus: "confirmed",
          candidateRespondedAt: new Date(),
          webhookStatus: open.webhookStatus === "none" ? "scheduled" : open.webhookStatus,
        },
      });
      interviewId = updated.id;
      meetingUrl = updated.meetingUrl;
    } else {
      const link = resolveMeetingUrl({ provider: "google_meet" });
      const created = await prisma.interview.create({
        data: {
          candidateId: parsed.data.candidateId, jobId, scheduledFor: when, status: "scheduled", provider: "mock",
          timezone: parsed.data.timezone ?? "UTC", durationMins: 45, meetingUrl: link.url, meetingProvider: link.provider,
          meetingProvisioned: link.provisioned, webhookStatus: "scheduled", candidateStatus: "confirmed", candidateRespondedAt: new Date(),
        },
      });
      interviewId = created.id;
      meetingUrl = created.meetingUrl;
    }

    // A client choosing a time is an interview request → advance the pipeline.
    await applyStage({ candidateId: parsed.data.candidateId, jobId, to: "interview", actor: "client" }).catch(() => {});
    await prisma.candidateEvent.create({
      data: { candidateId: parsed.data.candidateId, jobId, type: "interview_scheduled", actor: "client", meta: { interviewId, scheduledFor: when.toISOString(), via: "share_link" } },
    });
    await scheduleInterviewReminders(interviewId, when);
    await notify({ channel: "recruiter", title: "Client picked an interview time", body: `Interview scheduled for ${when.toISOString()} (${parsed.data.timezone ?? "UTC"}).`, jobId, candidateId: parsed.data.candidateId });
    await audit({ actorType: "client", action: "client_scheduled_interview", entity: "interview", entityId: interviewId, meta: { token, jobId }, ip });

    return NextResponse.json({ ok: true, interviewId, scheduledFor: when.toISOString(), meetingUrl, meetingProvisioned: Boolean(meetingUrl) });
  } catch (e) {
    if (e instanceof ShareError) {
      const status = e.code === "not_found" ? 404 : e.code === "candidate_not_shared" ? 403 : 410;
      return NextResponse.json({ error: e.code }, { status });
    }
    console.error("share schedule failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
