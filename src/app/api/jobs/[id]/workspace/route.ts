import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";
import { loadJobRow, serializeMatch } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";

export const runtime = "nodejs";

// GET /api/jobs/:id/workspace — everything the Job Workspace needs in one call
// (Mission 7.1 Part 2): overview, counts, pipeline, top candidates, client
// activity, interviews, notes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: { client: true, skills: { include: { skill: true } } },
  });
  if (!job || job.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // --- Pipeline counts ---
  const pipelines = await prisma.pipeline.findMany({ where: { jobId: id, candidate: { deletedAt: null } } });
  const stageCounts: Record<string, number> = { new: 0, screened: 0, sent_to_client: 0, interview: 0, approved: 0, offer: 0, rejected: 0, hired: 0 };
  for (const p of pipelines) stageCounts[p.stage] = (stageCounts[p.stage] ?? 0) + 1;

  // --- Top candidates: cached analyses, else compute on the fly ---
  let top;
  const cached = await prisma.candidateAnalysis.findMany({
    where: { jobId: id, candidate: { deletedAt: null, archivedAt: null } },
    include: { candidate: { include: { skills: { include: { skill: true } } } } },
    orderBy: { matchScore: "desc" },
    take: 6,
  });
  if (cached.length > 0) {
    top = await Promise.all(cached.map(async (a) => {
      const { scoreAvailability } = await import("@/lib/matching/availability");
      const c = a.candidate;
      const avail = scoreAvailability({ availability: c.availability, availabilityConfirmedAt: c.availabilityConfirmedAt, lastContactedAt: c.lastContactedAt, lastScreenedAt: c.lastScreenedAt, updatedAt: c.updatedAt });
      return {
        id: c.id, name: c.fullName, country: c.country, flag: c.flag, clientRate: c.clientRate,
        matchScore: a.matchScore, recommendation: a.recommendation, availabilityScore: avail.score, availabilityBand: avail.band,
        updatedAt: c.updatedAt,
        strengths: (a.strengths as { text: string }[]).slice(0, 2).map((s) => s.text),
        risks: (a.risks as { text: string }[]).slice(0, 2).map((s) => s.text),
        anomalies: (a.anomalies as { text: string }[]).map((s) => s.text),
        skills: c.skills.map((s) => s.skill.canonicalName).slice(0, 5),
      };
    }));
  } else {
    const jobRow = await loadJobRow(id);
    const results = jobRow ? await runMatch(jobRow, { limit: 6 }) : [];
    if (jobRow && results.length) await persistAnalyses(id, results).catch(() => {});
    top = results.map((r) => {
      const s = serializeMatch(r);
      return {
        id: s.id, name: s.name, country: s.country, flag: s.flag, clientRate: s.clientRate,
        matchScore: s.matchScore, recommendation: s.recommendation,
        availabilityScore: r.availability.score, availabilityBand: r.availability.band, updatedAt: r.candidate.updatedAt,
        strengths: s.strengths.slice(0, 2).map((x) => x.text), risks: s.risks.slice(0, 2).map((x) => x.text),
        anomalies: s.anomalies.map((x) => x.text), skills: s.skills.slice(0, 5),
      };
    });
  }

  // --- Counts summary ---
  const analyzed = await prisma.candidateAnalysis.count({ where: { jobId: id } });
  const submissions = await prisma.submission.findMany({ where: { jobId: id } });
  const counts = {
    matching: analyzed,
    submitted: submissions.length,
    interviewed: stageCounts.interview + stageCounts.approved + stageCounts.hired,
    approved: submissions.filter((s) => s.clientStatus === "approved").length,
    hired: stageCounts.hired,
    inPipeline: pipelines.length,
  };

  // --- Client activity ---
  const lastClientEvent = await prisma.candidateEvent.findFirst({
    where: { jobId: id, actor: "client" }, orderBy: { createdAt: "desc" }, include: { candidate: { select: { fullName: true } } },
  });
  const pendingApprovals = submissions.filter((s) => s.clientStatus === "pending").length;
  const shares = await prisma.shareLink.findMany({ where: { jobId: id }, select: { token: true, label: true, revoked: true, viewCount: true, lastViewedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } });

  // --- Interviews ---
  const interviews = await prisma.interview.findMany({
    where: { jobId: id }, orderBy: { createdAt: "desc" }, take: 10,
    include: { candidate: { select: { fullName: true } } },
  });

  // --- Offers (close the funnel, spec §8) ---
  const offers = await prisma.offer.findMany({
    where: { jobId: id },
    orderBy: { createdAt: "desc" },
    include: { candidate: { select: { id: true, fullName: true } } },
  });

  // --- Notes ---
  const notes = await prisma.note.findMany({ where: { jobId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, include: { candidate: { select: { fullName: true } } } });

  return NextResponse.json({
    overview: {
      id: job.id, title: job.title, seniority: job.seniority, status: job.status,
      client: job.client ? { id: job.client.id, name: job.client.name, company: job.client.company } : null,
      budgetMin: job.budgetMin, budgetMax: job.budgetMax, budgetUnit: job.budgetUnit,
      englishLevel: job.englishLevel, experienceYearsMin: job.experienceYearsMin,
      workMode: job.workMode, employmentType: job.employmentType, createdAt: job.createdAt,
      skills: job.skills.map((s) => ({ name: s.skill.canonicalName, required: s.required })),
    },
    counts,
    pipeline: stageCounts,
    topCandidates: top,
    clientActivity: {
      lastAction: lastClientEvent ? { type: lastClientEvent.type, candidate: lastClientEvent.candidate?.fullName, at: lastClientEvent.createdAt } : null,
      pendingApprovals,
      shares: shares.map((s) => ({ token: s.token, label: s.label, revoked: s.revoked, views: s.viewCount, lastViewedAt: s.lastViewedAt, url: `/share/${s.token}` })),
    },
    interviews: interviews.map((iv) => ({
      id: iv.id, candidate: iv.candidate?.fullName, status: iv.status, scheduledFor: iv.scheduledFor, completedAt: iv.completedAt,
      summary: iv.summary, recordingUrl: iv.recordingUrl, outcome: iv.outcome, meetingUrl: iv.meetingUrl,
    })),
    offers: offers.map((o) => ({
      id: o.id,
      candidateId: o.candidateId,
      candidate: o.candidate?.fullName,
      status: o.status,
      clientRate: o.clientRate,
      startDate: o.startDate,
      createdAt: o.createdAt,
    })),
    notes: notes.map((n) => ({ id: n.id, candidate: n.candidate?.fullName, kind: n.kind, body: n.body, internal: n.internal, createdAt: n.createdAt })),
  });
}
