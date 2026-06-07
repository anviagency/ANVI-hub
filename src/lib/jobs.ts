import { prisma } from "@/lib/db";
import { JobRow, MatchResult } from "@/lib/matching/funnel";

/** Load a job + its skills in the shape the matching funnel expects. */
export async function loadJobRow(jobId: string): Promise<JobRow | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { skills: { include: { skill: true } } },
  });
  if (!job) return null;
  return {
    id: job.id,
    title: job.title,
    seniority: job.seniority,
    experienceYearsMin: job.experienceYearsMin,
    englishLevel: job.englishLevel,
    budgetMax: job.budgetMax,
    budgetUnit: job.budgetUnit,
    skills: job.skills.map((js) => ({
      name: js.skill.canonicalName,
      required: js.required,
      minYears: js.minYears,
    })),
  };
}

/** Card-friendly shape for the chat candidate rows + drawer. */
export function serializeMatch(r: MatchResult) {
  return {
    id: r.candidate.id,
    name: r.candidate.fullName,
    title: r.candidate.title,
    country: r.candidate.country,
    location: r.candidate.location,
    flag: r.candidate.flag,
    english: r.candidate.englishLevel,
    availability: r.candidate.availability,
    availabilityNote: r.candidate.availabilityNote,
    clientRate: r.candidate.clientRate,
    skills: r.candidate.skills.map((s) => s.name),
    matchScore: r.matchScore,
    recommendation: r.recommendation,
    strengths: r.strengths,
    risks: r.risks,
    anomalies: r.anomalies,
    freshness: r.freshness,
    scoreBreakdown: r.scoreBreakdown,
    retentionProbability: r.retentionProbability ?? null,
    approvalProbability: r.approvalProbability ?? null,
    fitBreakdown: r.fitBreakdown ?? null,
    reasoning: r.reasoning ?? null,
    engineSource: r.engineSource ?? "deterministic",
  };
}

export type SerializedMatch = ReturnType<typeof serializeMatch>;
