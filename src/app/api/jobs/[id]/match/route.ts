import { NextRequest, NextResponse } from "next/server";
import { loadJobRow, serializeMatch } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";

export const runtime = "nodejs";

// POST /api/jobs/:id/match — run the two-stage funnel for a specific job and
// persist the resulting intelligence. Returns ranked, analyzed candidates.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await loadJobRow(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 8;

  const results = await runMatch(job, { limit });
  await persistAnalyses(job.id, results).catch((e) => console.error("persistAnalyses", e));

  return NextResponse.json({
    jobId: job.id,
    jobTitle: job.title,
    count: results.length,
    list: results.map(serializeMatch),
  });
}
