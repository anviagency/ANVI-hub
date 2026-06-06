import { enqueue } from "@/lib/queue/queue";

// Reminder scheduling (Mission 4 Part 2). Interview reminders at 24h / 1h / 10m
// before the meeting; a pending-feedback reminder after a configurable delay.
// All delivered via the background queue (no inline external HTTP).

const OFFSETS: { label: string; ms: number }[] = [
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "10m", ms: 10 * 60 * 1000 },
];

/** Enqueue interview reminders for the future offsets that haven't passed yet.
 * Each reminder carries the target time it was scheduled against (`forTime`) so a
 * later reschedule can invalidate stale reminders (handler skips a mismatch). */
export async function scheduleInterviewReminders(interviewId: string, scheduledFor: Date, now: Date = new Date()): Promise<string[]> {
  const scheduled: string[] = [];
  const forTime = scheduledFor.toISOString();
  for (const o of OFFSETS) {
    const runAt = new Date(scheduledFor.getTime() - o.ms);
    if (runAt.getTime() <= now.getTime()) continue; // offset already passed
    await enqueue("interview_reminder", { interviewId, label: o.label, forTime }, { runAt });
    scheduled.push(o.label);
  }
  return scheduled;
}

/** Enqueue a pending-feedback reminder after `delayMs` (default 24h). */
export async function schedulePendingFeedbackReminder(clientId: string, jobId: string, delayMs = 24 * 60 * 60 * 1000): Promise<void> {
  await enqueue("pending_feedback_reminder", { clientId, jobId }, { runAt: new Date(Date.now() + delayMs) });
}
