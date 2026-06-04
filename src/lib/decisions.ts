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

export async function applyClientDecision(input: ApplyClientDecisionInput): Promise<{ decision: ClientDecision; stage: PipelineStage }> {
  const to = DECISION_STAGE[input.decision];
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

  return { decision: input.decision, stage: result.to };
}
