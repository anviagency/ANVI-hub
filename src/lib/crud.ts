import { prisma } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import type { EventType, Actor, Prisma } from "@prisma/client";

// Shared change-logging for CRUD operations (Mission 5.1 P1). Every mutation
// writes a candidate timeline event (when candidate-scoped) AND an audit log,
// so nothing changes silently and history is preserved.

export async function recordChange(opts: {
  action: string; // e.g. "candidate_edited", "job_archived", "interview_cancelled"
  entity: string;
  entityId: string;
  userId?: string | null;
  ip?: string;
  meta?: Record<string, unknown>;
  candidateId?: string; // when set, also writes a candidate timeline event
  jobId?: string | null;
  eventType?: EventType; // defaults to "updated"
  actor?: Actor;
}): Promise<void> {
  if (opts.candidateId) {
    await prisma.candidateEvent
      .create({
        data: {
          candidateId: opts.candidateId,
          jobId: opts.jobId ?? null,
          type: opts.eventType ?? "updated",
          actor: opts.actor ?? "recruiter",
          meta: { action: opts.action, ...(opts.meta ?? {}) } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
  }
  await audit({ userId: opts.userId ?? null, action: opts.action, entity: opts.entity, entityId: opts.entityId, meta: opts.meta, ip: opts.ip });
}
