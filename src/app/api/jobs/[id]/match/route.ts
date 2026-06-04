import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadJobRow, serializeMatch } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import { enqueue } from "@/lib/queue/queue";

export const runtime = "nodejs";

// GET /api/jobs/:id/match — return the CACHED candidate_analysis for this job
// (Mission 3.5 P2: the cache is now read, not just written). No recompute.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id }, select: { id: true, title: true, updatedAt: true } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const analyses = await prisma.candidateAnalysis.findMany({
    where: { jobId: id },
    include: { candidate: { include: { skills: { include: { skill: true } } } } },
    orderBy: { matchScore: "desc" },
  });
  return NextResponse.json({
    jobId: job.id,
    jobTitle: job.title,
    source: "cache",
    count: analyses.length,
    list: analyses.map((a) => ({
      id: a.candidateId,
      name: a.candidate.fullName,
      title: a.candidate.title,
      country: a.candidate.country,
      flag: a.candidate.flag,
      clientRate: a.candidate.clientRate,
      skills: a.candidate.skills.map((s) => s.skill.canonicalName),
      matchScore: a.matchScore,
      recommendation: a.recommendation,
      strengths: a.strengths,
      risks: a.risks,
      anomalies: a.anomalies,
      analyzedAt: a.analyzedAt,
      stale: a.analyzedAt.getTime() < a.candidate.updatedAt.getTime() || a.analyzedAt.getTime() < job.updatedAt.getTime(),
    })),
  });
}

// POST /api/jobs/:id/match — run the funnel. `?async=1` enqueues a background
// analyze_job (Mission 3.5 P4) and returns a task id; otherwise runs inline.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const job = await loadJobRow(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 8;

  if (req.nextUrl.searchParams.get("async") === "1") {
    const taskId = await enqueue("analyze_job", { jobId: id, limit });
    await audit({ userId: auth.user.id, action: "match_enqueued", entity: "job", entityId: id, ip: getClientIp(req) });
    return NextResponse.json({ taskId, status: "queued" }, { status: 202 });
  }

  const results = await runMatch(job, { limit });
  await persistAnalyses(job.id, results).catch((e) => console.error("persistAnalyses", e));
  await audit({ userId: auth.user.id, action: "match_run", entity: "job", entityId: id, meta: { count: results.length }, ip: getClientIp(req) });

  return NextResponse.json({ jobId: job.id, jobTitle: job.title, source: "computed", count: results.length, list: results.map(serializeMatch) });
}
