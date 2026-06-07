import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";
import type { CandidateInput, JobRequirement, CandidateAnalysisResult } from "@/lib/types";
import type { ClientInsight } from "@prisma/client";
import { predictRetention, deriveFitBreakdown } from "@/lib/matching/predictions";
import { approvalProbability } from "@/lib/matching/client-memory";

// AI matching layer (Mission 10 Phase 3). The deterministic engine (scoring.ts)
// stays the trusted default and fallback. This module:
//   1. ALWAYS enriches results with deterministic retention + fit breakdown.
//   2. When AI_MATCHING is enabled (and a provider configured), re-evaluates the
//      finalists with the LLM (batched), merging reasoning + an adjusted score —
//      but the deterministic anomaly penalty CAPS the AI score (the AI can never
//      explain away a red flag), and any failure falls back to deterministic.

export const AI_MATCHING_ENABLED = () => process.env.AI_MATCHING === "1" && aiEnabled;

export interface MatchLike extends CandidateAnalysisResult {
  candidate: CandidateInput;
}

/** Always-on deterministic enrichment: retention + fit breakdown + approval prob. */
export function enrichDeterministic<T extends MatchLike>(results: T[], job: JobRequirement, currentYear: number, clientInsight?: ClientInsight | null): T[] {
  return results.map((r) => ({
    ...r,
    retentionProbability: predictRetention(r.candidate, currentYear),
    fitBreakdown: deriveFitBreakdown(r.candidate, job, currentYear),
    approvalProbability: approvalProbability(r.candidate, clientInsight ?? null).probability,
    reasoning: r.reasoning ?? null,
    engineSource: r.engineSource ?? "deterministic",
  }));
}

const SYSTEM = `You are a senior technical recruiter scoring candidates for a role.
For EACH candidate, judge overall fit and write one concise reason. Consider technical fit,
seniority, communication, availability and budget. Return ONLY JSON:
{"results":[{"id":string,"score":number,"reasoning":string,"fit":{"technical":number,"culture":number,"leadership":number,"communication":number}}]}
Scores are 0-100. Be evidence-based and conservative.`;

interface LlmMatch { results?: { id: string; score?: number; reasoning?: string; fit?: Record<string, number> }[] }

/** Re-evaluate finalists with the LLM (batched). Returns a map id→{score,reasoning,fit} or null. */
async function aiEvaluate(job: JobRequirement, results: MatchLike[]): Promise<Map<string, { score: number; reasoning: string; fit: Record<string, number> }> | null> {
  const compact = results.slice(0, 12).map((r) => ({
    id: r.candidate.id,
    name: r.candidate.fullName,
    title: r.candidate.title,
    english: r.candidate.englishLevel,
    rate: r.candidate.clientRate,
    available: r.candidate.availability,
    skills: r.candidate.skills.map((s) => `${s.name}:${s.years}y`),
    deterministicScore: r.matchScore,
    anomalies: r.anomalies.map((a) => a.text),
  }));
  const jobDesc = {
    title: job.title,
    requiredSkills: job.skills.filter((s) => s.required).map((s) => `${s.name}${s.minYears ? ` ${s.minYears}y+` : ""}`),
    niceToHave: job.skills.filter((s) => !s.required).map((s) => s.name),
    minYears: job.experienceYearsMin,
    english: job.englishLevel,
    budgetMax: job.budgetMax,
  };
  const llm = await completeJson<LlmMatch>({
    model: MODEL_FAST,
    system: SYSTEM,
    user: `JOB:\n${JSON.stringify(jobDesc)}\n\nCANDIDATES:\n${JSON.stringify(compact)}`,
    maxTokens: 1800,
  });
  if (!llm?.results) return null;
  const map = new Map<string, { score: number; reasoning: string; fit: Record<string, number> }>();
  for (const r of llm.results) {
    if (!r.id) continue;
    map.set(r.id, { score: typeof r.score === "number" ? r.score : 0, reasoning: r.reasoning ?? "", fit: r.fit ?? {} });
  }
  return map;
}

/**
 * Full matching enrichment. Deterministic always; AI rerank when enabled.
 * Anomalies cap the AI score. Never throws — falls back to deterministic.
 */
export async function enrichMatches<T extends MatchLike>(results: T[], job: JobRequirement, currentYear: number, clientInsight?: ClientInsight | null): Promise<T[]> {
  const base = enrichDeterministic(results, job, currentYear, clientInsight);
  if (!AI_MATCHING_ENABLED() || base.length === 0) return base;

  try {
    const aiMap = await aiEvaluate(job, base);
    if (!aiMap) return base;
    return base.map((r) => {
      const ai = aiMap.get(r.candidate.id);
      if (!ai) return r;
      // Deterministic anomaly penalty caps the AI score (AI can't explain away red flags).
      const anomalyCap = r.anomalies.some((a) => a.severity === "high") ? 60 : r.anomalies.some((a) => a.severity === "med") ? 80 : 100;
      const score = Math.max(0, Math.min(anomalyCap, Math.round(ai.score)));
      const fb = r.fitBreakdown ?? deriveFitBreakdown(r.candidate, job, currentYear);
      return {
        ...r,
        matchScore: score,
        recommendation: score >= 80 ? "strong" : score >= 60 ? "possible" : "weak",
        reasoning: ai.reasoning || r.reasoning || null,
        fitBreakdown: {
          ...fb,
          technical: typeof ai.fit.technical === "number" ? ai.fit.technical : fb.technical,
          culture: typeof ai.fit.culture === "number" ? ai.fit.culture : fb.culture,
          leadership: typeof ai.fit.leadership === "number" ? ai.fit.leadership : fb.leadership,
          communication: typeof ai.fit.communication === "number" ? ai.fit.communication : fb.communication,
        },
        engineSource: "ai" as const,
      };
    });
  } catch (e) {
    console.error("AI matching failed, using deterministic:", (e as Error).message);
    return base;
  }
}
