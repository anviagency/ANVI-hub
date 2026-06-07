import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Candidate similarity engine (Mission 10 Phase 5). A deterministic, structured
// similarity over skills + experience + rate — works with NO pgvector and NO AI
// (the required fallback). Embeddings can layer on later; this is the always-on
// engine that powers "similar to X / last hire / cheaper / stronger English".

const candidateInclude = { skills: { include: { skill: true } } } satisfies Prisma.CandidateDefaultArgs["include"];

function englishRank(level: string | null | undefined): number {
  if (!level) return -1;
  if (/native|fluent|c2/i.test(level)) return 9;
  if (/c1/i.test(level)) return 6;
  if (/b2\+|upper/i.test(level)) return 5;
  if (/b2/i.test(level)) return 4;
  if (/conversational/i.test(level)) return 3;
  if (/b1/i.test(level)) return 2;
  return 0;
}

interface SimCandidate {
  id: string;
  fullName: string;
  skills: Set<string>;
  totalYears: number;
  clientRate: number | null;
  englishLevel: string | null;
  country: string | null;
}

function toSim(row: { id: string; fullName: string; totalYears: number | null; clientRate: number | null; englishLevel: string | null; country: string | null; skills: { skill: { canonicalName: string } }[] }): SimCandidate {
  return {
    id: row.id,
    fullName: row.fullName,
    skills: new Set(row.skills.map((s) => s.skill.canonicalName.toLowerCase())),
    totalYears: row.totalYears ?? 0,
    clientRate: row.clientRate,
    englishLevel: row.englishLevel,
    country: row.country,
  };
}

/** 0-100 similarity: skill Jaccard (dominant) + years closeness + country match. */
export function similarityScore(a: SimCandidate, b: SimCandidate): number {
  const inter = [...a.skills].filter((s) => b.skills.has(s)).length;
  const union = new Set([...a.skills, ...b.skills]).size || 1;
  const jaccard = inter / union; // 0-1
  const yearsClose = 1 - Math.min(Math.abs(a.totalYears - b.totalYears) / 10, 1); // 0-1
  const countryMatch = a.country && b.country && a.country === b.country ? 1 : 0;
  return Math.round(jaccard * 75 + yearsClose * 18 + countryMatch * 7);
}

export interface SimilarOptions {
  limit?: number;
  cheaperThanRef?: boolean; // only candidates cheaper than the reference
  strongerEnglish?: boolean; // only candidates with higher English than the reference
  excludePlaced?: boolean;
}

export interface SimilarResult {
  reference: { id: string; name: string } | null;
  candidates: { id: string; name: string; similarity: number; clientRate: number | null; englishLevel: string | null; country: string | null; skills: string[] }[];
}

/** Find candidates similar to a reference candidate, with optional modifiers. */
export async function similarToCandidate(refId: string, opts: SimilarOptions = {}): Promise<SimilarResult> {
  const refRow = await prisma.candidate.findUnique({ where: { id: refId }, include: candidateInclude });
  if (!refRow) return { reference: null, candidates: [] };
  const ref = toSim(refRow);

  const rows = await prisma.candidate.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      id: { not: refId },
      ...(opts.excludePlaced ? { availability: { not: "placed" } } : {}),
    },
    include: candidateInclude,
    take: 500,
  });

  const refEnglish = englishRank(ref.englishLevel);
  let scored = rows
    .map((r) => ({ row: r, sim: toSim(r) }))
    .map(({ row, sim }) => ({ sim, score: similarityScore(ref, sim), row }))
    .filter((x) => x.score > 0);

  if (opts.cheaperThanRef && ref.clientRate != null) {
    scored = scored.filter((x) => x.sim.clientRate != null && x.sim.clientRate < ref.clientRate!);
  }
  if (opts.strongerEnglish) {
    scored = scored.filter((x) => englishRank(x.sim.englishLevel) > refEnglish);
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, opts.limit ?? 8);

  return {
    reference: { id: ref.id, name: ref.fullName },
    candidates: top.map((x) => ({
      id: x.sim.id,
      name: x.sim.fullName,
      similarity: x.score,
      clientRate: x.sim.clientRate,
      englishLevel: x.sim.englishLevel,
      country: x.sim.country,
      skills: [...x.sim.skills],
    })),
  };
}

/** Find candidates similar to a client's most recent successful (placed) hire. */
export async function similarToLastHire(clientId: string, opts: SimilarOptions = {}): Promise<SimilarResult> {
  const placement = await prisma.placement.findFirst({
    where: { clientId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { candidateId: true },
  });
  if (!placement) return { reference: null, candidates: [] };
  return similarToCandidate(placement.candidateId, { ...opts, excludePlaced: true });
}
