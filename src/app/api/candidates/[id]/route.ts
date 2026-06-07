import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toCandidateInput, toJobRequirement } from "@/lib/matching/funnel";
import { loadJobRow } from "@/lib/jobs";
import { detectAnomalies } from "@/lib/matching/anomaly";
import { scoreStability, detectNotableEmployers } from "@/lib/matching/insights";
import { analyzeCandidate } from "@/lib/matching/scoring";
import { scoreFreshness } from "@/lib/matching/freshness";
import { scoreAvailability } from "@/lib/matching/availability";
import { getFreshAnalysis } from "@/lib/matching/cache";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { recordChange } from "@/lib/crud";
import { getClientIp } from "@/lib/security/request";
import { z } from "zod";

export const runtime = "nodejs";

const EditBody = z.object({
  fullName: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  englishLevel: z.string().nullable().optional(),
  totalYears: z.number().nullable().optional(),
  clientRate: z.number().nullable().optional(),
  salaryExpectation: z.number().nullable().optional(),
  availability: z.enum(["available", "on_hold", "placed"]).optional(),
  availabilityNote: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  aiSummary: z.string().nullable().optional(),
  confirmAvailability: z.boolean().optional(), // stamps availabilityConfirmedAt = now
});

// PATCH /api/candidates/:id — edit a candidate (Mission 5.1 P1).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = await prisma.candidate.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = EditBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const { confirmAvailability, ...fields } = parsed.data;

  const data: Record<string, unknown> = { ...fields };
  if (confirmAvailability) data.availabilityConfirmedAt = new Date();
  await prisma.candidate.update({ where: { id }, data });
  await recordChange({ action: "candidate_edited", entity: "candidate", entityId: id, candidateId: id, userId: auth.user.id, ip: getClientIp(req), meta: { fields: Object.keys(fields), confirmedAvailability: !!confirmAvailability } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/candidates/:id — soft delete (recoverable; never hard-deleted).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = await prisma.candidate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.candidate.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordChange({ action: "candidate_deleted", entity: "candidate", entityId: id, candidateId: id, userId: auth.user.id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true, deleted: true });
}

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
      notes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      pipelines: { include: { job: { include: { client: true } } } },
      interviews: { orderBy: { scheduledFor: "desc" } },
      intelligence: true,
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
      email: row.email,
      phone: row.phone,
      linkedinUrl: row.linkedinUrl,
      archived: Boolean(row.archivedAt),
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
    // Recruiter insights (internal): stability/job-hopping signal + recognised
    // employers. Cheap, deterministic, derived from employment history.
    stability: scoreStability(input, currentYear),
    notableEmployers: detectNotableEmployers(input),
    // Structured Candidate Intelligence (Mission 10 Phase 2) — null until built.
    intelligence: row.intelligence
      ? {
          source: row.intelligence.source, confidence: row.intelligence.confidence,
          languages: row.intelligence.languages, frameworks: row.intelligence.frameworks, databases: row.intelligence.databases,
          cloudProviders: row.intelligence.cloudProviders, devopsTools: row.intelligence.devopsTools, aimlTools: row.intelligence.aimlTools,
          architectureExp: row.intelligence.architectureExp,
          industries: row.intelligence.industries, domains: row.intelligence.domains, companySizes: row.intelligence.companySizes,
          startupExp: row.intelligence.startupExp, enterpriseExp: row.intelligence.enterpriseExp, consultingExp: row.intelligence.consultingExp,
          teamLeadership: row.intelligence.teamLeadership, managementYears: row.intelligence.managementYears, hiringExp: row.intelligence.hiringExp, mentoringExp: row.intelligence.mentoringExp, maxTeamSize: row.intelligence.maxTeamSize,
          spokenLanguages: row.intelligence.spokenLanguages, writtenLanguages: row.intelligence.writtenLanguages, englishConfidence: row.intelligence.englishConfidence, communicationConfidence: row.intelligence.communicationConfidence,
          city: row.intelligence.city, timezone: row.intelligence.timezone, relocationWilling: row.intelligence.relocationWilling, remoteExperience: row.intelligence.remoteExperience,
          avgTenureMonths: row.intelligence.avgTenureMonths, stabilityScore: row.intelligence.stabilityScore, jobHopping: row.intelligence.jobHopping,
          education: row.intelligence.education, certifications: row.intelligence.certifications, militaryExp: row.intelligence.militaryExp,
        }
      : null,
    // Freshness is job-independent and always available.
    freshness: scoreFreshness(input),
    // Availability confidence (Mission 5.1 P5) + communication health (P4).
    availabilityScore: scoreAvailability({ availability: input.availability, availabilityConfirmedAt: input.availabilityConfirmedAt, lastContactedAt: input.lastContactedAt, lastScreenedAt: input.lastScreenedAt, updatedAt: input.updatedAt }),
    communicationHealth: commHealth(row.lastContactedAt),
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
    // Interview summaries + video links (TimeOS/Timeless) + scheduling (Mission 5.1 P3).
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
      meetingUrl: iv.meetingUrl,
      meetingProvider: iv.meetingProvider,
      timezone: iv.timezone,
      durationMins: iv.durationMins,
      status: iv.status,
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

// Communication health (Mission 5.1 P4): 🟢 contacted within ~1 day, 🟡 within 30
// days, 🔴 30+ days or never.
function commHealth(lastContactedAt: Date | null): { band: "green" | "yellow" | "red"; daysSinceContact: number | null } {
  if (!lastContactedAt) return { band: "red", daysSinceContact: null };
  const days = Math.floor((Date.now() - lastContactedAt.getTime()) / 86400000);
  const band = days <= 1 ? "green" : days <= 30 ? "yellow" : "red";
  return { band, daysSinceContact: days };
}
