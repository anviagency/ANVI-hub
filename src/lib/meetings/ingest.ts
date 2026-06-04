import { prisma } from "@/lib/db";
import { getMeetingProvider, MeetingSummary } from "@/lib/meetings/provider";
import { applyStage, canTransition, PipelineTransitionError } from "@/lib/pipeline";
import { notifyScreeningCompleted } from "@/lib/whatsapp/events";
import { audit } from "@/lib/auth/audit";
import type { Prisma } from "@prisma/client";

// Interview summary ingestion (Mission 4 Part 5). Idempotent on the meeting id
// via webhook_event's unique (provider, externalId). Attaches the recording +
// summary to the interview, advances the pipeline to "screened", and fires the
// client's screening-completed WhatsApp message.

export interface IngestResult {
  status: "processed" | "duplicate" | "unmatched";
  interviewId?: string;
  candidateId?: string;
  waMessageId?: string | null;
}

export async function ingestMeetingSummary(summary: MeetingSummary, opts: { actorUserId?: string } = {}): Promise<IngestResult> {
  // Idempotency gate keyed on the meeting id.
  try {
    await prisma.webhookEvent.create({
      data: { provider: "timeos", externalId: summary.meetingId, type: "summary_ready", payload: summary as unknown as Prisma.InputJsonValue, status: "received" },
    });
  } catch {
    return { status: "duplicate" };
  }

  const provider = getMeetingProvider();
  const match = await provider.resolveMeetingToCandidate(summary);
  if (!match) {
    await prisma.webhookEvent.update({ where: { provider_externalId: { provider: "timeos", externalId: summary.meetingId } }, data: { status: "failed", error: "unmatched", processedAt: new Date() } });
    return { status: "unmatched" };
  }

  const interview = await prisma.interview.update({
    where: { id: match.interviewId },
    data: {
      timelessMeetingId: summary.meetingId,
      provider: provider.name,
      recordingUrl: summary.recordingUrl ?? undefined,
      transcript: summary.transcript ?? undefined,
      summary: summary.summary ?? undefined,
      actionItems: (summary.actionItems ?? []) as unknown as Prisma.InputJsonValue,
      participants: (summary.participants ?? []) as unknown as Prisma.InputJsonValue,
      meetingTime: summary.meetingTime ? new Date(summary.meetingTime) : undefined,
      completedAt: new Date(),
      outcome: "completed",
      webhookStatus: "summary_ready",
    },
    include: { job: true },
  });

  // Advance the pipeline to "screened" if the transition is legal from here.
  if (interview.jobId) {
    const pipe = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: interview.candidateId, jobId: interview.jobId } } });
    const from = pipe?.stage ?? "new";
    if (canTransition(from, "screened")) {
      try {
        await applyStage({ candidateId: interview.candidateId, jobId: interview.jobId, to: "screened", actor: "system" });
      } catch (e) {
        if (!(e instanceof PipelineTransitionError)) throw e;
      }
    }
  }

  // Candidate timeline event.
  await prisma.candidateEvent.create({
    data: { candidateId: interview.candidateId, jobId: interview.jobId, type: "screened", actor: "system", meta: { meetingId: summary.meetingId, source: provider.name } },
  });
  await prisma.candidate.update({ where: { id: interview.candidateId }, data: { lastScreenedAt: new Date() } });

  // Notify the client (screening completed) via WhatsApp.
  let waMessageId: string | null = null;
  if (interview.jobId) waMessageId = await notifyScreeningCompleted(interview.id).catch(() => null);

  await audit({ userId: opts.actorUserId ?? null, actorType: "system", action: "interview_summary_ingested", entity: "interview", entityId: interview.id, meta: { meetingId: summary.meetingId } });
  await prisma.webhookEvent.update({ where: { provider_externalId: { provider: "timeos", externalId: summary.meetingId } }, data: { status: "processed", processedAt: new Date() } });

  return { status: "processed", interviewId: interview.id, candidateId: interview.candidateId, waMessageId };
}
