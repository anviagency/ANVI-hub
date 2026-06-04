import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toCandidateInput, toJobRequirement } from "@/lib/matching/funnel";
import { loadJobRow } from "@/lib/jobs";
import { detectAnomalies } from "@/lib/matching/anomaly";
import { analyzeCandidate } from "@/lib/matching/scoring";
import { scoreFreshness } from "@/lib/matching/freshness";
import { getFreshAnalysis } from "@/lib/matching/cache";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";

export const runtime = "nodejs";

// GET /api/candidates/:id?jobId=... — the candidate workspace / data room (spec §4.4).
// Anomalies are job-independent and always computed; full strengths/risks/score
// are computed against the requested job when one is supplied. Reads the
// candidate_analysis cache when fresh (Mission 3.5 P2). Auth required.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jobId = req.nextUrl.searchParams.get("jobId") ?? undefined;

  const row = await prisma.candidate.findUnique({
    where: { id },
    include: {
      skills: { include: { skill: true } },
      employments: { orderBy: { startDate: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 20 },
      notes: { orderBy: { createdAt: "desc" } },
      pipelines: { include: { job: { include: { client: true } } } },
      interviews: { orderBy: { scheduledFor: "desc" } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = toCandidateInput(row);
  const currentYear = new Date().getUTCFullYear();
  const anomalies = detectAnomalies(input, { currentYear });

  // If no jobId was given, default analysis to the candidate's furthest-along pipeline job.
  const effectiveJobId = jobId ?? row.pipelines[0]?.jobId;

  let analysis = null;
  let analysisSource: "none" | "cache" | "computed" = "none";
  if (effectiveJobId) {
    const jobMeta = await prisma.job.findUnique({ where: { id: effectiveJobId }, select: { updatedAt: true } });
    const cached = jobMeta
      ? await getFreshAnalysis(id, effectiveJobId, row.updatedAt, jobMeta.updatedAt)
      : { analysis: null, hit: false };
    if (cached.hit && cached.analysis) {
      // Serve cached evidence; recompute only freshness (time-dependent, cheap).
      analysis = {
        matchScore: cached.analysis.matchScore,
        recommendation: cached.analysis.recommendation,
        strengths: cached.analysis.strengths,
        risks: cached.analysis.risks,
        anomalies: cached.analysis.anomalies,
        freshness: scoreFreshness(input),
        scoreBreakdown: [],
      };
      analysisSource = "cache";
    } else {
      const job = await loadJobRow(effectiveJobId);
      if (job) {
        analysis = analyzeCandidate({ candidate: input, job: toJobRequirement(job), anomalies, currentYear });
        analysisSource = "computed";
      }
    }
  }

  return NextResponse.json({
    candidate: {
      id: row.id,
      name: row.fullName,
      title: row.title,
      country: row.country,
      location: row.location,
      flag: row.flag,
      english: row.englishLevel,
      totalYears: row.totalYears,
      availability: row.availability,
      availabilityNote: row.availabilityNote,
      clientRate: row.clientRate,
      salaryExpectation: row.salaryExpectation,
      source: row.source,
      aiSummary: row.aiSummary,
      linkedinTitle: row.linkedinTitle,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastContactedAt: row.lastContactedAt,
      lastScreenedAt: row.lastScreenedAt,
      skills: row.skills.map((s) => ({ name: s.skill.canonicalName, years: s.years })),
      employments: row.employments.map((e) => ({
        company: e.company,
        title: e.title,
        fullTime: e.fullTime,
        startDate: e.startDate,
        endDate: e.endDate,
      })),
    },
    anomalies,
    // Freshness is job-independent and always available.
    freshness: scoreFreshness(input),
    analysis, // null unless a job context (explicit or pipeline) exists
    analysisSource, // "cache" | "computed" | "none" (Mission 3.5 P2 observability)
    // Communication history + internal notes (recruiter view shows all).
    notes: row.notes.map((n) => ({
      id: n.id,
      kind: n.kind,
      body: n.body,
      internal: n.internal,
      author: n.author,
      createdAt: n.createdAt,
    })),
    // Matched jobs / pipeline placements.
    pipelines: row.pipelines.map((p) => ({
      jobId: p.jobId,
      jobTitle: p.job.title,
      client: p.job.client?.company ?? null,
      stage: p.stage,
      enteredStageAt: p.enteredStageAt,
    })),
    // Interview summaries + video links (TimeOS/Timeless).
    interviews: row.interviews.map((iv) => ({
      id: iv.id,
      summary: iv.summary,
      recordingUrl: iv.recordingUrl,
      transcriptAvailable: Boolean(iv.transcript),
      actionItems: iv.actionItems,
      participants: iv.participants,
      provider: iv.provider,
      meetingTag: iv.meetingTag,
      meetingTime: iv.meetingTime,
      webhookStatus: iv.webhookStatus,
      scheduledFor: iv.scheduledFor,
      completedAt: iv.completedAt,
      outcome: iv.outcome,
    })),
    timeline: row.events.map((ev) => ({
      type: ev.type,
      actor: ev.actor,
      meta: ev.meta,
      createdAt: ev.createdAt,
    })),
  });
}
