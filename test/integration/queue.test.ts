import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { enqueue, processOnce, processJobs, type JobType } from "@/lib/queue/queue";

// DB integration: the Postgres-backed job queue (Mission 3.5 P4).

async function cleanup() {
  // Tests are the only producer (Telegram is unconfigured in tests, so nothing
  // else enqueues) — clear the table so processOnce can't claim a stray job.
  await prisma.backgroundJob.deleteMany({});
}

describe("background queue (DB)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("runs a job to completion and stores the result", async () => {
    const id = await enqueue("t_ok" as JobType, { x: 1 });
    const handlers = { t_ok: async (p: Record<string, unknown>) => ({ doubled: (p.x as number) * 2 }) };
    expect(await processOnce(handlers)).toBe(true);
    const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("done");
    expect((job.result as { doubled: number }).doubled).toBe(2);
  });

  it("fails permanently after exhausting attempts", async () => {
    const id = await enqueue("t_fail" as JobType, {}, { maxAttempts: 1 });
    const handlers = { t_fail: async () => { throw new Error("boom"); } };
    await processOnce(handlers);
    const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("failed");
    expect(job.lastError).toContain("boom");
  });

  it("requeues for retry when attempts remain", async () => {
    const id = await enqueue("t_retry" as JobType, {}, { maxAttempts: 3 });
    const handlers = { t_retry: async () => { throw new Error("transient"); } };
    await processOnce(handlers);
    const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("pending"); // back in the queue
    expect(job.attempts).toBe(1);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now()); // backoff scheduled
  });

  it("processes nothing when the queue is empty", async () => {
    await cleanup();
    const n = await processJobs({}, 10);
    expect(n).toBe(0);
  });
});
