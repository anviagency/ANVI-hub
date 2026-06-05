import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import { getMeetingProvider } from "@/lib/meetings/provider";
import { generateMeetingLink } from "@/lib/meetings/links";
import { scheduleInterviewReminders } from "@/lib/reminders";

export const runtime = "nodejs";

const Body = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
  scheduledFor: z.string().datetime(),
  timezone: z.string().optional(),
  durationMins: z.number().optional(),
  meetingProvider: z.enum(["google_meet", "zoom", "teams"]).optional(),
  meetingUrl: z.string().optional(),
  attendees: z.array(z.object({ name: z.string().optional(), email: z.string().optional(), role: z.string().optional() })).optional(),
});

// POST /api/interviews/schedule — recruiter marks a screening scheduled.
// Creates the interview, generates a provider meeting tag, and queues reminders.
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const { candidateId, jobId, scheduledFor, timezone, durationMins, attendees } = parsed.data;

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!candidate || !job) return NextResponse.json({ error: "candidate_or_job_not_found" }, { status: 404 });

  const provider = getMeetingProvider();
  const when = new Date(scheduledFor);
  const link = parsed.data.meetingUrl
    ? { url: parsed.data.meetingUrl, provider: parsed.data.meetingProvider ?? "google_meet" }
    : generateMeetingLink(parsed.data.meetingProvider ?? "google_meet");

  // Create the interview first to seed the tag from its id.
  const interview = await prisma.interview.create({
    data: {
      candidateId, jobId, scheduledFor: when, provider: provider.name, webhookStatus: "scheduled", status: "scheduled",
      timezone: timezone ?? "UTC", durationMins: durationMins ?? 45, meetingUrl: link.url, meetingProvider: link.provider,
      participants: (attendees ?? []) as object[],
    },
  });
  const meetingTag = provider.createMeetingTag(interview.id);
  await prisma.interview.update({ where: { id: interview.id }, data: { meetingTag } });

  await prisma.candidateEvent.create({
    data: { candidateId, jobId, type: "interview_scheduled", actor: "recruiter", meta: { interviewId: interview.id, scheduledFor: when.toISOString(), meetingTag } },
  });

  const reminders = await scheduleInterviewReminders(interview.id, when);
  await audit({ userId: auth.user.id, action: "interview_scheduled", entity: "interview", entityId: interview.id, meta: { candidateId, jobId, scheduledFor: when.toISOString() }, ip: getClientIp(req) });

  return NextResponse.json({ interviewId: interview.id, meetingTag, meetingUrl: link.url, meetingProvider: link.provider, scheduledFor: when.toISOString(), reminders });
}
