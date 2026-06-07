import { prisma } from "@/lib/db";
import {
  CandidateInput,
  CandidateAnalysisResult,
  EmploymentRecord,
  JobRequirement,
} from "@/lib/types";
import { detectAnomalies, detectDuplicates } from "@/lib/matching/anomaly";
import { analyzeCandidate } from "@/lib/matching/scoring";
import type { Prisma } from "@prisma/client";

// Two-stage matching funnel (spec §3).
//   Stage 1: cheap SQL/Prisma filter — narrows the pool, never runs an LLM.
//   Stage 2: deep analysis (anomaly engine + scoring) on the survivors only.

const candidateWithRelations = {
  include: { skills: { include: { skill: true } }, employments: true },
} satisfies Prisma.CandidateDefaultArgs;

type CandidateRow = Prisma.CandidateGetPayload<typeof candidateWithRelations>;

export function toCandidateInput(row: CandidateRow): CandidateInput {
  return {
    id: row.id,
    fullName: row.fullName,
    title: row.title,
    country: row.country,
    location: row.location,
    flag: row.flag,
    englishLevel: row.englishLevel,
    totalYears: row.totalYears ?? null,
    careerStartYear: row.careerStartYear ?? null,
    availability: row.availability,
    availabilityNote: row.availabilityNote,
    clientRate: row.clientRate ?? null,
    linkedinTitle: row.linkedinTitle,
    email: row.email ?? null,
    updatedAt: row.updatedAt,
    lastContactedAt: row.lastContactedAt ?? null,
    lastScreenedAt: row.lastScreenedAt ?? null,
    availabilityConfirmedAt: row.availabilityConfirmedAt ?? null,
    skills: row.skills.map((cs) => ({ name: cs.skill.canonicalName, years: cs.years })),
    employments: row.employments.map(toEmploymentRecord),
  };
}

function toEmploymentRecord(e: CandidateRow["employments"][number]): EmploymentRecord {
  return {
    company: e.company,
    title: e.title,
    fullTime: e.fullTime,
    startYear: e.startDate.getUTCFullYear(),
    startMonth: e.startDate.getUTCMonth() + 1,
    endYear: e.endDate ? e.endDate.getUTCFullYear() : null,
    endMonth: e.endDate ? e.endDate.getUTCMonth() + 1 : null,
  };
}

export interface JobRow {
  id: string;
  title: string;
  seniority: string | null;
  experienceYearsMin: number | null;
  englishLevel: string | null;
  budgetMax: number | null;
  budgetUnit: string | null;
  skills: { name: string; required: boolean; minYears: number | null }[];
}

export function toJobRequirement(job: JobRow): JobRequirement {
  return {
    title: job.title,
    seniority: job.seniority,
    experienceYearsMin: job.experienceYearsMin,
    englishLevel: job.englishLevel,
    budgetMax: job.budgetMax,
    budgetUnit: job.budgetUnit,
    skills: job.skills,
  };
}

export interface MatchResult extends CandidateAnalysisResult {
  candidate: CandidateInput;
}

export interface MatchOptions {
  limit?: number; // max analyzed results returned
  stage1Cap?: number; // max candidates passed from stage 1 to stage 2
  minScore?: number; // drop results below this score
  currentYear?: number;
  now?: Date;
}

/**
 * Stage 1 — fast filter. Pulls candidates that are plausibly relevant using
 * indexed columns + a coarse skill overlap. Deliberately permissive: the goal
 * is to cut 100k -> ~80, not to rank.
 */
export async function stage1Filter(job: JobRow, cap: number): Promise<CandidateRow[]> {
  const requiredSkillNames = job.skills.filter((s) => s.required).map((s) => s.name);
  const anySkillNames = job.skills.map((s) => s.name);

  const rows = await prisma.candidate.findMany({
    where: {
      // Never match soft-deleted or archived candidates (Mission 5.1 P1).
      deletedAt: null,
      archivedAt: null,
      // Availability: exclude already-placed talent.
      availability: { not: "placed" },
      // At least one of the job's skills present (coarse overlap).
      ...(anySkillNames.length > 0
        ? { skills: { some: { skill: { canonicalName: { in: anySkillNames } } } } }
        : {}),
    },
    ...candidateWithRelations,
    orderBy: { updatedAt: "desc" },
    take: cap * 4, // overfetch, then refine in-memory below
  });

  // Refine: keep candidates covering at least one REQUIRED skill (if any required).
  const refined =
    requiredSkillNames.length > 0
      ? rows.filter((r) =>
          r.skills.some((cs) => requiredSkillNames.includes(cs.skill.canonicalName))
        )
      : rows;

  return refined.slice(0, cap);
}

/** Stage 2 — deep analysis on the survivors. */
export function stage2Analyze(
  candidates: CandidateInput[],
  job: JobRequirement,
  opts: { currentYear: number; now?: Date }
): MatchResult[] {
  // Cross-candidate duplicate detection runs once over the whole survivor set.
  const dupes = detectDuplicates(candidates);
  return candidates.map((c) => {
    const anomalies = detectAnomalies(c, { currentYear: opts.currentYear });
    const dup = dupes.get(c.id);
    if (dup) anomalies.push(dup);
    const analysis = analyzeCandidate({
      candidate: c,
      job,
      anomalies,
      currentYear: opts.currentYear,
      now: opts.now,
    });
    return { ...analysis, candidate: c };
  });
}

/** Full funnel: stage 1 (DB) -> stage 2 (analysis) -> ranked results. */
export async function runMatch(job: JobRow, opts: MatchOptions = {}): Promise<MatchResult[]> {
  const now = opts.now ?? new Date();
  const currentYear = opts.currentYear ?? now.getUTCFullYear();
  const stage1Cap = opts.stage1Cap ?? 80;
  const limit = opts.limit ?? 8;
  const minScore = opts.minScore ?? 1;

  const rows = await stage1Filter(job, stage1Cap);
  const inputs = rows.map(toCandidateInput);
  const analyzed = stage2Analyze(inputs, toJobRequirement(job), { currentYear, now });

  const ranked = analyzed
    .filter((r) => r.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  // Mission 10 Phase 3/4: always enrich with deterministic retention + fit breakdown
  // + client-memory approval probability; AI re-ranks finalists when AI_MATCHING is
  // enabled (anomaly-capped, fallback-safe).
  const { enrichMatches } = await import("@/lib/matching/ai-match");
  const clientRow = await prisma.job.findUnique({ where: { id: job.id }, select: { clientId: true } });
  const clientInsight = clientRow?.clientId
    ? await prisma.clientInsight.findUnique({ where: { clientId: clientRow.clientId } })
    : null;
  const enriched = await enrichMatches(ranked, toJobRequirement(job), currentYear, clientInsight);
  return enriched.sort((a, b) => b.matchScore - a.matchScore);
}

/** Persist analyses so the candidate workspace / portal can read cached intelligence. */
export async function persistAnalyses(jobId: string, results: MatchResult[]): Promise<void> {
  await Promise.all(
    results.map((r) =>
      prisma.candidateAnalysis.upsert({
        where: { candidateId_jobId: { candidateId: r.candidateId, jobId } },
        create: {
          candidateId: r.candidateId,
          jobId,
          matchScore: r.matchScore,
          recommendation: r.recommendation,
          strengths: r.strengths as unknown as Prisma.InputJsonValue,
          risks: r.risks as unknown as Prisma.InputJsonValue,
          anomalies: r.anomalies as unknown as Prisma.InputJsonValue,
          retentionProbability: r.retentionProbability ?? null,
          approvalProbability: r.approvalProbability ?? null,
          fitBreakdown: (r.fitBreakdown ?? undefined) as Prisma.InputJsonValue | undefined,
          reasoning: r.reasoning ?? null,
          engineSource: r.engineSource ?? "deterministic",
          modelVersion: r.engineSource === "ai" ? "ai-v1" : "deterministic-v1",
        },
        update: {
          matchScore: r.matchScore,
          recommendation: r.recommendation,
          strengths: r.strengths as unknown as Prisma.InputJsonValue,
          risks: r.risks as unknown as Prisma.InputJsonValue,
          anomalies: r.anomalies as unknown as Prisma.InputJsonValue,
          retentionProbability: r.retentionProbability ?? null,
          approvalProbability: r.approvalProbability ?? null,
          fitBreakdown: (r.fitBreakdown ?? undefined) as Prisma.InputJsonValue | undefined,
          reasoning: r.reasoning ?? null,
          engineSource: r.engineSource ?? "deterministic",
          modelVersion: r.engineSource === "ai" ? "ai-v1" : "deterministic-v1",
          analyzedAt: new Date(),
        },
      })
    )
  );
}
