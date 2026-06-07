import { prisma } from "@/lib/db";
import { applyStage } from "@/lib/pipeline";
import { audit } from "@/lib/auth/audit";
import type { PipelineStage } from "@prisma/client";

// Shared client-decision logic (Mission 4 Part 3). Both the share-link surface
// and the WhatsApp inbound handler funnel through here so a client decision
// updates pipeline + submission + timeline + audit identically, regardless of
// channel.

export type ClientDecision = "approve" | "reject" | "request_interview";

const DECISION_STAGE: Record<ClientDecision, PipelineStage> = {
  approve: "approved",
  reject: "rejected",
  request_interview: "interview",
};

const DECISION_EVENT = {
  approve: "client_approved",
  reject: "client_rejected",
  request_interview: "interview_requested",
} as const;

export interface ApplyClientDecisionInput {
  candidateId: string;
  jobId: string;
  decision: ClientDecision;
  via: "share_link" | "whatsapp";
  reason?: string;
  ip?: string;
}

// "Already settled" states that make a re-applied decision a safe no-op (idempotency).
const SETTLED_FOR: Record<ClientDecision, PipelineStage[]> = {
  approve: ["approved", "hired"],
  reject: ["rejected"],
  request_interview: ["interview", "approved", "hired"],
};

export async function applyClientDecision(input: ApplyClientDecisionInput): Promise<{ decision: ClientDecision; stage: PipelineStage; idempotent?: boolean }> {
  const to = DECISION_STAGE[input.decision];

  // Idempotency (Mission 5.1 P0): if the candidate is already in a stage that
  // satisfies this decision, do nothing and report success — a duplicate or
  // out-of-order client tap must never error or double-write the timeline.
  const existing = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: input.candidateId, jobId: input.jobId } } });
  if (existing && SETTLED_FOR[input.decision].includes(existing.stage)) {
    return { decision: input.decision, stage: existing.stage, idempotent: true };
  }

  // applyStage updates pipeline stage, syncs the Submission, fires notifications.
  const result = await applyStage({ candidateId: input.candidateId, jobId: input.jobId, to, actor: "client", feedback: input.reason });

  // Channel-specific timeline event.
  await prisma.candidateEvent.create({
    data: {
      candidateId: input.candidateId,
      jobId: input.jobId,
      type: DECISION_EVENT[input.decision],
      actor: "client",
      meta: { via: input.via, reason: input.reason ?? null },
    },
  });

  await audit({
    actorType: "client",
    action: `client_${input.decision}`,
    entity: "candidate",
    entityId: input.candidateId,
    meta: { jobId: input.jobId, via: input.via, reason: input.reason ?? null },
    ip: input.ip,
  });

  // Learn the client's preferences from this decision (Mission 10 Phase 4).
  const job = await prisma.job.findUnique({ where: { id: input.jobId }, select: { clientId: true } });
  if (job?.clientId) {
    const { enqueue } = await import("@/lib/queue/queue");
    await enqueue("recompute_client_insight", { clientId: job.clientId }).catch(() => {});
  }

  return { decision: input.decision, stage: result.to };
}
