import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";
import { scoreAvailability } from "@/lib/matching/availability";

export const runtime = "nodejs";

// GET /api/jobs/:id/suggestions — proactive AI nudges (Mission 7.1 Part 4).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id }, include: { client: true, skills: { include: { skill: true } } } });
  if (!job || job.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const suggestions: { type: string; severity: "info" | "warn" | "action"; text: string; action?: string }[] = [];

  // 1. Strong candidates analyzed but not yet submitted.
  const analyses = await prisma.candidateAnalysis.findMany({ where: { jobId: id, recommendation: "strong" }, select: { candidateId: true } });
  const strongIds = analyses.map((a) => a.candidateId);
  if (strongIds.length) {
    const submittedIds = new Set((await prisma.pipeline.findMany({ where: { jobId: id, candidateId: { in: strongIds }, stage: { in: ["sent_to_client", "interview", "approved", "hired"] } } })).map((p) => p.candidateId));
    const notSubmitted = strongIds.filter((cid) => !submittedIds.has(cid)).length;
    if (notSubmitted > 0) suggestions.push({ type: "strong_not_submitted", severity: "action", text: `You have ${notSubmitted} strong candidate${notSubmitted === 1 ? "" : "s"} not submitted yet.`, action: "submit" });
  }

  // 2. Client hasn't reviewed pending submissions in a while.
  const pending = await prisma.submission.findMany({ where: { jobId: id, clientStatus: "pending" } });
  if (pending.length) {
    const lastClient = await prisma.candidateEvent.findFirst({ where: { jobId: id, actor: "client" }, orderBy: { createdAt: "desc" } });
    const days = lastClient ? Math.floor((Date.now() - lastClient.createdAt.getTime()) / 86400000) : null;
    if (days === null || days >= 3) {
      suggestions.push({ type: "client_stale", severity: "warn", text: `${job.client?.company ?? "The client"} has ${pending.length} candidate${pending.length === 1 ? "" : "s"} awaiting review${days != null ? ` (${days} days)` : ""}.`, action: "share" });
    }
  }

  // 3. Stale availability among pipeline candidates.
  const pipeCands = await prisma.candidate.findMany({ where: { deletedAt: null, pipelines: { some: { jobId: id } } } });
  const stale = pipeCands.filter((c) => scoreAvailability({ availability: c.availability, availabilityConfirmedAt: c.availabilityConfirmedAt, lastContactedAt: c.lastContactedAt, lastScreenedAt: c.lastScreenedAt, updatedAt: c.updatedAt }).band === "low").length;
  if (stale > 0) suggestions.push({ type: "stale_availability", severity: "warn", text: `${stale} candidate${stale === 1 ? "" : "s"} ${stale === 1 ? "has" : "have"} stale availability data — reconfirm before submitting.`, action: "confirm_availability" });

  // 4. Missing salary range.
  if (job.budgetMin == null) suggestions.push({ type: "missing_salary", severity: "info", text: "This position is missing a salary range.", action: "edit_job" });

  // 5. Few fully-qualified candidates (covers all required skills).
  const analyzedCount = await prisma.candidateAnalysis.count({ where: { jobId: id } });
  if (analyzedCount === 0) {
    suggestions.push({ type: "not_matched", severity: "action", text: "No candidates matched yet — run a match to source from the pool.", action: "match" });
  } else {
    const fullyQualified = await prisma.candidateAnalysis.count({ where: { jobId: id, recommendation: "strong" } });
    suggestions.push({ type: "qualified_count", severity: "info", text: `${fullyQualified} candidate${fullyQualified === 1 ? "" : "s"} meet all key requirements out of ${analyzedCount} analyzed.` });
  }

  return NextResponse.json({ suggestions });
}
