import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Postgres-backed job queue (Mission 3.5 P4). Uses SELECT ... FOR UPDATE SKIP
// LOCKED so multiple workers can drain it safely without external infra.

export type JobType =
  | "deliver_notification"
  | "import_candidates"
  | "analyze_job"
  | "wa_send"
  | "interview_reminder"
  | "pending_feedback_reminder"
  | "extract_candidate_intelligence";

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: { runAt?: Date; maxAttempts?: number } = {}): Promise<string> {
  const job = await prisma.backgroundJob.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      // Prisma fills @default(now()) on the HOST clock, but claimNext filters on
      // the Postgres clock (run_at <= now()). If the host runs ahead, a fresh job
      // is briefly unclaimable. Stamp 1s in the past to absorb host/DB skew.
      runAt: opts.runAt ?? new Date(Date.now() - 1000),
      maxAttempts: opts.maxAttempts ?? 5,
    },
  });
  return job.id;
}

/** Atomically claim the next runnable job (or null). Increments attempts. */
export async function claimNext(): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE background_job
       SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM background_job
        WHERE status = 'pending' AND run_at <= now()
        ORDER BY run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING id, type, payload, attempts, max_attempts;
  `;
  return rows[0] ?? null;
}

export type Handlers = Record<string, (payload: Record<string, unknown>) => Promise<unknown>>;

/** Claim and run one job. Returns true if a job was processed. */
export async function processOnce(handlers: Handlers): Promise<boolean> {
  const job = await claimNext();
  if (!job) return false;

  const handler = handlers[job.type];
  if (!handler) {
    await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: "failed", lastError: `no handler for ${job.type}` } });
    return true;
  }

  try {
    const result = await handler(job.payload);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "done", result: (result ?? {}) as Prisma.InputJsonValue, lockedAt: null },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const retry = job.attempts < job.max_attempts;
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: retry
        ? { status: "pending", runAt: new Date(Date.now() + backoffMs(job.attempts)), lastError: msg, lockedAt: null }
        : { status: "failed", lastError: msg, lockedAt: null },
    });
  }
  return true;
}

/** Drain up to `max` jobs (single pass). Used by the worker loop and tests. */
export async function processJobs(handlers: Handlers, max = 100): Promise<number> {
  let n = 0;
  while (n < max) {
    const did = await processOnce(handlers);
    if (!did) break;
    n++;
  }
  return n;
}

function backoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts);
}
