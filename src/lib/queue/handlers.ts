import { deliverTelegramNotification } from "@/lib/notify";
import { ingestRows, ColumnMapping } from "@/lib/import/ingest";
import { loadJobRow } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { deliverWaMessage } from "@/lib/whatsapp/messages";
import { notifyInterviewReminder, notifyPendingFeedback } from "@/lib/whatsapp/events";
import { sendEmail } from "@/lib/email/provider";
import { prisma } from "@/lib/db";
import type { Handlers } from "@/lib/queue/queue";

// Background job handlers (Mission 3.5 P4). Each is a pure async function of its
// payload so the worker stays trivial and the handlers are unit-testable.

export const handlers: Handlers = {
  // Outbound Telegram delivery — the only external HTTP, now off the request path.
  deliver_notification: async (payload) => {
    return deliverTelegramNotification(String(payload.notificationId));
  },

  // Bulk candidate import (dedupe + create/update) runs off-request so large
  // files never block or time out the HTTP handler.
  import_candidates: async (payload) => {
    const rows = (payload.rows ?? []) as Record<string, string>[];
    const mapping = (payload.mapping ?? {}) as ColumnMapping;
    const summary = await ingestRows(rows, mapping, {
      filename: payload.filename as string | undefined,
      source: payload.source as string | undefined,
    });
    return summary;
  },

  // Deep AI analysis for a whole job — computes + persists the candidate_analysis
  // cache so read surfaces (drawer, portal, match GET) serve without recomputing.
  analyze_job: async (payload) => {
    const jobId = String(payload.jobId);
    const job = await loadJobRow(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);
    const results = await runMatch(job, { limit: typeof payload.limit === "number" ? payload.limit : 50 });
    await persistAnalyses(job.id, results);
    return { jobId, analyzed: results.length };
  },

  // Outbound WhatsApp delivery — the only WhatsApp HTTP, off the request path.
  wa_send: async (payload) => {
    return deliverWaMessage(String(payload.messageId));
  },

  // Interview reminder: WhatsApp + email (if available). Skips cancelled interviews.
  interview_reminder: async (payload) => {
    const interviewId = String(payload.interviewId);
    const label = String(payload.label ?? "");
    const interview = await prisma.interview.findUnique({ where: { id: interviewId }, include: { candidate: true, job: { include: { client: true } } } });
    if (!interview || interview.status === "cancelled") return { skipped: "cancelled_or_missing" };
    // Skip a stale reminder left over from before a reschedule: it was enqueued
    // for a different target time than the interview now holds.
    const forTime = payload.forTime ? String(payload.forTime) : null;
    if (forTime && interview.scheduledFor && interview.scheduledFor.toISOString() !== forTime) {
      return { skipped: "rescheduled" };
    }
    const waId = await notifyInterviewReminder(interviewId, label);
    let email = "skipped";
    if (interview?.job?.client?.email) {
      const r = await sendEmail({
        to: interview.job.client.email,
        subject: `Interview reminder (${label}) — ${interview.candidate.fullName}`,
        body: `Reminder: interview with ${interview.candidate.fullName} for ${interview.job.title}.`,
        jobId: interview.jobId, candidateId: interview.candidateId,
      });
      email = r.status;
    }
    return { waMessageId: waId, email };
  },

  // Candidate Intelligence extraction (Mission 10 Phase 2) — off-request so the
  // (AI) extraction never blocks intake. Idempotent upsert.
  extract_candidate_intelligence: async (payload) => {
    const { upsertCandidateIntelligence } = await import("@/lib/ai/candidate-intelligence");
    const candidateId = String(payload.candidateId);
    const ok = await upsertCandidateIntelligence(candidateId);
    return { candidateId, ok };
  },

  // Job Intelligence extraction (Mission 10 Phase 3) — off-request, cached for AI matching.
  extract_job_intelligence: async (payload) => {
    const { upsertJobIntelligence } = await import("@/lib/ai/job-intelligence");
    const jobId = String(payload.jobId);
    const ok = await upsertJobIntelligence(jobId);
    return { jobId, ok };
  },

  // Pending-feedback reminder for a client/job.
  pending_feedback_reminder: async (payload) => {
    const waId = await notifyPendingFeedback(String(payload.clientId), String(payload.jobId));
    return { waMessageId: waId };
  },
};
