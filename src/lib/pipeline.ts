import { prisma } from "@/lib/db";
import { notifyBoth } from "@/lib/notify";
import type { PipelineStage, Actor } from "@prisma/client";

// Recruiting pipeline (mission item 4). Stage machine + a DB applier that keeps
// the pipeline row, the candidate timeline (CandidateEvent), the client-facing
// Submission, and notifications all in sync on every transition.

export const STAGES: PipelineStage[] = [
  "new",
  "screened",
  "sent_to_client",
  "interview",
  "approved",
  "rejected",
  "hired",
];

export const STAGE_LABEL: Record<PipelineStage, string> = {
  new: "New",
  screened: "Screened",
  sent_to_client: "Sent to client",
  interview: "Interview",
  approved: "Approved",
  rejected: "Rejected",
  hired: "Hired",
};

// Allowed forward/branch transitions. Reject is reachable from any active stage;
// rejected can be re-opened back into screening.
const ALLOWED: Record<PipelineStage, PipelineStage[]> = {
  new: ["screened", "sent_to_client", "rejected"],
  screened: ["sent_to_client", "interview", "rejected", "new"],
  sent_to_client: ["interview", "approved", "rejected", "screened"],
  interview: ["approved", "rejected", "sent_to_client"],
  approved: ["hired", "rejected", "interview"],
  rejected: ["new", "screened"],
  hired: [],
};

export function canTransition(from: PipelineStage, to: PipelineStage): boolean {
  if (from === to) return true; // idempotent
  return ALLOWED[from]?.includes(to) ?? false;
}

export function isStage(value: string): value is PipelineStage {
  return (STAGES as string[]).includes(value);
}

export interface ApplyStageResult {
  candidateId: string;
  jobId: string;
  from: PipelineStage;
  to: PipelineStage;
  changed: boolean;
}

/**
 * Move a candidate to a stage for a job. Creates the pipeline row on first use.
 * Emits a timeline event, syncs the Submission, and fires notifications.
 */
export async function applyStage(opts: {
  candidateId: string;
  jobId: string;
  to: PipelineStage;
  actor?: Actor;
  feedback?: string | null;
}): Promise<ApplyStageResult> {
  const { candidateId, jobId, to } = opts;
  const actor: Actor = opts.actor ?? "recruiter";

  const existing = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId, jobId } } });
  const from: PipelineStage = existing?.stage ?? "new";

  if (existing && !canTransition(from, to)) {
    throw new PipelineTransitionError(from, to);
  }

  // Upsert pipeline row at the target stage.
  await prisma.pipeline.upsert({
    where: { candidateId_jobId: { candidateId, jobId } },
    create: { candidateId, jobId, stage: to, enteredStageAt: new Date() },
    update: { stage: to, enteredStageAt: new Date() },
  });

  const changed = !existing || from !== to;
  if (!changed) return { candidateId, jobId, from, to, changed: false };

  // Timeline event.
  await prisma.candidateEvent.create({
    data: {
      candidateId,
      jobId,
      type: "stage_changed",
      actor,
      meta: { from, to, feedback: opts.feedback ?? null },
    },
  });

  // Keep candidate convenience timestamps fresh.
  if (to === "screened") {
    await prisma.candidate.update({ where: { id: candidateId }, data: { lastScreenedAt: new Date() } });
  }

  // Sync the client-facing Submission when the candidate reaches/leaves client stages.
  await syncSubmission(candidateId, jobId, to, opts.feedback ?? null);

  // Create a Placement when hired.
  if (to === "hired") {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (job?.clientId) {
      await prisma.placement.create({
        data: { clientId: job.clientId, candidateId, jobId, startDate: new Date(), status: "active" },
      });
    }
    await prisma.candidate.update({ where: { id: candidateId }, data: { availability: "placed" } });
  }

  // Notify recruiters + telegram group.
  const cand = await prisma.candidate.findUnique({ where: { id: candidateId } });
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { client: true } });
  await notifyBoth({
    title: `Pipeline: ${cand?.fullName ?? "Candidate"} → ${STAGE_LABEL[to]}`,
    body: `${cand?.fullName ?? "Candidate"} moved from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]} on ${job?.title ?? "a role"}${
      job?.client?.company ? ` (${job.client.company})` : ""
    }.`,
    jobId,
    candidateId,
  });

  return { candidateId, jobId, from, to, changed: true };
}

async function syncSubmission(
  candidateId: string,
  jobId: string,
  stage: PipelineStage,
  feedback: string | null
): Promise<void> {
  const clientStages: PipelineStage[] = ["sent_to_client", "interview", "approved", "rejected", "hired"];
  if (!clientStages.includes(stage)) return;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.clientId) return;

  const clientStatus = stage === "approved" || stage === "hired" ? "approved" : stage === "rejected" ? "rejected" : "pending";

  await prisma.submission.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    create: { clientId: job.clientId, jobId, candidateId, clientStatus, clientFeedback: feedback },
    update: { clientStatus, ...(feedback ? { clientFeedback: feedback } : {}) },
  });
}

export class PipelineTransitionError extends Error {
  constructor(public from: PipelineStage, public to: PipelineStage) {
    super(`Invalid pipeline transition: ${from} -> ${to}`);
    this.name = "PipelineTransitionError";
  }
}
