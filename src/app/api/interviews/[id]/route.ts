import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { recordChange } from "@/lib/crud";
import { getClientIp } from "@/lib/security/request";
import { scheduleInterviewReminders } from "@/lib/reminders";

export const runtime = "nodejs";

const Reschedule = z.object({
  scheduledFor: z.string().datetime().optional(),
  timezone: z.string().optional(),
  durationMins: z.number().optional(),
  meetingUrl: z.string().url().optional(),
  meetingProvider: z.enum(["google_meet", "zoom", "teams"]).optional(),
});

// PATCH /api/interviews/:id — reschedule / update meeting details (Mission 5.1 P1+P3).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const iv = await prisma.interview.findUnique({ where: { id } });
  if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = Reschedule.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const data: Record<string, unknown> = { ...parsed.data };
  const rescheduled = Boolean(parsed.data.scheduledFor);
  if (parsed.data.scheduledFor) data.scheduledFor = new Date(parsed.data.scheduledFor);
  if (rescheduled) {
    data.status = "rescheduled";
    // A new time invalidates the candidate's prior confirmation — they re-confirm.
    data.candidateStatus = "none";
    data.candidateRespondedAt = null;
  }
  // A recruiter-pasted URL is a REAL link → mark it provisioned (Phase 1 honesty).
  if (parsed.data.meetingUrl) data.meetingProvisioned = true;

  await prisma.interview.update({ where: { id }, data });

  let reminders: string[] = [];
  if (rescheduled && parsed.data.scheduledFor) {
    reminders = await scheduleInterviewReminders(id, new Date(parsed.data.scheduledFor));
  }
  await recordChange({ action: "interview_rescheduled", entity: "interview", entityId: id, candidateId: iv.candidateId, jobId: iv.jobId, eventType: "interview_scheduled", userId: auth.user.id, ip: getClientIp(req), meta: { scheduledFor: parsed.data.scheduledFor } });
  return NextResponse.json({ ok: true, reminders });
}

// DELETE /api/interviews/:id — cancel the interview (kept for history).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const iv = await prisma.interview.findUnique({ where: { id } });
  if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  await prisma.interview.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date(), cancelReason: body?.reason ?? null } });
  await recordChange({ action: "interview_cancelled", entity: "interview", entityId: id, candidateId: iv.candidateId, jobId: iv.jobId, userId: auth.user.id, ip: getClientIp(req), meta: { reason: body?.reason ?? null } });
  return NextResponse.json({ ok: true, cancelled: true });
}
