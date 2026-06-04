import { prisma } from "@/lib/db";
import type { Strength, Risk, Anomaly } from "@/lib/types";

// candidate_analysis cache reader (Mission 3.5 P2). The audit flagged that the
// cache was written but never read. Read surfaces (candidate workspace, client
// portal, match GET) now serve cached intelligence when it is still FRESH —
// i.e. the cache was computed after the candidate AND the job last changed.

export interface CachedAnalysis {
  matchScore: number;
  recommendation: string;
  strengths: Strength[];
  risks: Risk[];
  anomalies: Anomaly[];
  analyzedAt: Date;
}

export function isCacheFresh(analyzedAt: Date, candidateUpdatedAt: Date, jobUpdatedAt: Date): boolean {
  return analyzedAt.getTime() >= candidateUpdatedAt.getTime() && analyzedAt.getTime() >= jobUpdatedAt.getTime();
}

/**
 * Return the cached analysis only if it is still fresh, else null (caller should
 * recompute). `fresh` is reported separately so callers can record cache hit/miss.
 */
export async function getFreshAnalysis(
  candidateId: string,
  jobId: string,
  candidateUpdatedAt: Date,
  jobUpdatedAt: Date
): Promise<{ analysis: CachedAnalysis | null; hit: boolean; stale: boolean }> {
  const row = await prisma.candidateAnalysis.findUnique({
    where: { candidateId_jobId: { candidateId, jobId } },
  });
  if (!row) return { analysis: null, hit: false, stale: false };
  const fresh = isCacheFresh(row.analyzedAt, candidateUpdatedAt, jobUpdatedAt);
  if (!fresh) return { analysis: null, hit: false, stale: true };
  return {
    analysis: {
      matchScore: row.matchScore,
      recommendation: row.recommendation,
      strengths: row.strengths as unknown as Strength[],
      risks: row.risks as unknown as Risk[],
      anomalies: row.anomalies as unknown as Anomaly[],
      analyzedAt: row.analyzedAt,
    },
    hit: true,
    stale: false,
  };
}
