import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import { getMeetingProvider } from "@/lib/meetings/provider";
import { resolveMeetingUrl } from "@/lib/meetings/links";
import { scheduleInterviewReminders } from "@/lib/reminders";

export const runtime = "nodejs";

const Body = z
  .object({
    candidateId: z.string().min(1),
    jobId: z.string().min(1),
    // A concrete time (recruiter picks date+time+timezone) OR proposed slots for
    // the candidate/client to choose from. At least one is required.
    scheduledFor: z.string().datetime().optional(),
    proposedSlots: z.array(z.string().datetime()).max(10).optional(),
    timezone: z.string().min(1).optional(),
    durationMins: z.number().int().positive().max(480).optional(),
    meetingProvider: z.enum(["google_meet", "zoom", "teams"]).optional(),
    // A REAL meeting link the recruiter pastes (Zoom/Meet they created). Optional.
    meetingUrl: z.string().url().optional(),
    attendees: z.array(z.object({ name: z.string().optional(), email: z.string().optional(), role: z.string().optional() })).optional(),
  })
  .refine((b) => b.scheduledFor || (b.proposedSlots && b.proposedSlots.length > 0), {
    message: "Provide either scheduledFor or at least one proposedSlot",
  });

// POST /api/interviews/schedule — the recruiter schedules a screening/interview.
// Phase 2: real date/time/timezone, optional proposed slots, and an OPTIONAL real
// meeting link. No fake links are ever fabricated (Phase 1).
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const { candidateId, jobId, scheduledFor, proposedSlots, timezone, durationMins, attendees } = parsed.data;

  try {
    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: candidateId } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);
    if (!candidate || !job) return NextResponse.json({ error: "candidate_or_job_not_found" }, { status: 404 });

    const provider = getMeetingProvider();
    const when = scheduledFor ? new Date(scheduledFor) : null;
    const slots = (proposedSlots ?? []).map((s) => new Date(s).toISOString());
    const link = resolveMeetingUrl({ provided: parsed.data.meetingUrl, provider: parsed.data.meetingProvider });
    const status = when ? "scheduled" : "proposed";

    const interview = await prisma.interview.create({
      data: {
        candidateId,
        jobId,
        scheduledFor: when,
        proposedSlots: slots,
        provider: provider.name,
        webhookStatus: when ? "scheduled" : "none",
        status,
        timezone: timezone ?? "UTC",
        durationMins: durationMins ?? 45,
        meetingUrl: link.url,
        meetingProvider: link.provider,
        meetingProvisioned: link.provisioned,
        participants: (attendees ?? []) as object[],
      },
    });
    const meetingTag = provider.createMeetingTag(interview.id);
    await prisma.interview.update({ where: { id: interview.id }, data: { meetingTag } });

    await prisma.candidateEvent.create({
      data: {
        candidateId,
        jobId,
        type: "interview_scheduled",
        actor: "recruiter",
        meta: { interviewId: interview.id, scheduledFor: when?.toISOString() ?? null, proposedSlots: slots, meetingTag, status },
      },
    });

    // Reminders only make sense once there's a concrete time.
    const reminders = when ? await scheduleInterviewReminders(interview.id, when) : [];
    await audit({ userId: auth.user.id, action: "interview_scheduled", entity: "interview", entityId: interview.id, meta: { candidateId, jobId, scheduledFor: when?.toISOString() ?? null, proposedSlots: slots }, ip: getClientIp(req) });

    return NextResponse.json({
      interviewId: interview.id,
      status,
      meetingTag,
      meetingUrl: link.url,
      meetingProvisioned: link.provisioned,
      meetingProvider: link.provider,
      scheduledFor: when?.toISOString() ?? null,
      proposedSlots: slots,
      reminders,
    });
  } catch (e) {
    console.error("interview schedule failed", e);
    return NextResponse.json({ error: "schedule_failed" }, { status: 500 });
  }
}
