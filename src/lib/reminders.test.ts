import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit test the reminder offset logic without a DB by mocking the queue.
const enqueued: { type: string; runAt?: Date }[] = [];
vi.mock("@/lib/queue/queue", () => ({
  enqueue: async (type: string, _p: unknown, opts?: { runAt?: Date }) => {
    enqueued.push({ type, runAt: opts?.runAt });
    return "job-id";
  },
}));

import { scheduleInterviewReminders } from "./reminders";

describe("scheduleInterviewReminders", () => {
  beforeEach(() => {
    enqueued.length = 0;
  });

  it("schedules 24h/1h/10m reminders for a future interview", async () => {
    const now = new Date("2026-06-04T00:00:00Z");
    const scheduledFor = new Date("2026-06-10T12:00:00Z");
    const labels = await scheduleInterviewReminders("iv1", scheduledFor, now);
    expect(labels).toEqual(["24h", "1h", "10m"]);
    expect(enqueued).toHaveLength(3);
    // Each runAt is before the meeting time.
    for (const e of enqueued) expect(e.runAt!.getTime()).toBeLessThan(scheduledFor.getTime());
  });

  it("skips offsets that have already passed", async () => {
    const now = new Date("2026-06-10T11:30:00Z"); // 30 min before
    const scheduledFor = new Date("2026-06-10T12:00:00Z");
    const labels = await scheduleInterviewReminders("iv1", scheduledFor, now);
    // 24h and 1h are in the past; only 10m remains.
    expect(labels).toEqual(["10m"]);
  });
});
