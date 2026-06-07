import type { CandidateInput, JobRequirement } from "@/lib/types";
import { scoreStability } from "@/lib/matching/insights";
import { computeSkillCoverage } from "@/lib/matching/scoring";
import { careerYears } from "@/lib/matching/anomaly";

// Deterministic predictions (Mission 10 Phase 3). These are ALWAYS computed (no
// AI needed) so the matching output is rich even in the deterministic fallback.
// The AI layer may add reasoning + approval probability on top.

export interface FitBreakdown {
  technical: number | null;
  industry: number | null;
  culture: number | null;
  leadership: number | null;
  communication: number | null;
  availability: number | null;
  budget: number | null;
}

function englishConfidencePct(level: string | null | undefined): number | null {
  if (!level) return null;
  if (/native|fluent|c2/i.test(level)) return 95;
  if (/c1/i.test(level)) return 85;
  if (/b2\+|upper/i.test(level)) return 72;
  if (/b2/i.test(level)) return 65;
  if (/b1/i.test(level)) return 45;
  return 50;
}

/**
 * Retention probability (0-100): how likely the candidate stays. Derived from
 * stability (tenure, short stints, gaps) + whether currently employed. Returns
 * null when there's no employment history to judge (never a fabricated number).
 */
export function predictRetention(c: CandidateInput, currentYear: number): number | null {
  const stab = scoreStability(c, currentYear);
  if (stab.score == null) return null;
  let p = stab.score; // stability is the dominant signal
  // Long total career adds a little confidence; very short careers reduce it.
  const years = careerYears(c, currentYear);
  if (years >= 8) p += 5;
  else if (years < 2) p -= 8;
  return Math.max(0, Math.min(100, Math.round(p)));
}

/** Per-dimension fit (0-100), deterministic. Dimensions we can't infer without
 * richer intelligence/client memory are left null rather than guessed. */
export function deriveFitBreakdown(c: CandidateInput, job: JobRequirement, currentYear: number): FitBreakdown {
  const cov = computeSkillCoverage(c, job);
  const technical = cov.required > 0 ? Math.round((cov.requiredMatched / cov.required) * 100) : null;

  let budget: number | null = null;
  if (job.budgetMax != null && c.clientRate != null) {
    budget = c.clientRate <= job.budgetMax ? 100 : Math.max(0, Math.round(100 - ((c.clientRate - job.budgetMax) / job.budgetMax) * 100));
  }

  const availability = c.availability === "available" ? 100 : c.availability === "on_hold" ? 50 : 0;
  const communication = englishConfidencePct(c.englishLevel);

  return {
    technical,
    industry: null, // requires JobIntelligence + CandidateIntelligence industries
    culture: null, // requires culture signals
    leadership: null, // requires CandidateIntelligence leadership
    communication,
    availability,
    budget,
  };
}
