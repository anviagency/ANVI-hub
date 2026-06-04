import { deliverTelegramNotification } from "@/lib/notify";
import { ingestRows, ColumnMapping } from "@/lib/import/ingest";
import { loadJobRow } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
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
};
