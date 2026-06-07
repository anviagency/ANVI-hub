import { prisma } from "@/lib/db";
import type { CandidateInput } from "@/lib/types";
import type { ClientInsight, Prisma } from "@prisma/client";

// Client Memory (Mission 10 Phase 4). Learns each client's decision patterns from
// the data we already capture (submissions + their client status + candidate
// facts), and computes a COLD-START-SAFE approval probability per candidate —
// returning null (never a fabricated confident number) when history is too thin.

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

const MIN_DECISIONS = 2; // below this, we don't claim a confident probability

/** Recompute a client's learned insight from their decision history. Deterministic. */
export async function recomputeClientInsight(clientId: string): Promise<boolean> {
  const subs = await prisma.submission.findMany({
    where: { clientId },
    include: { candidate: { select: { clientRate: true, country: true, englishLevel: true } } },
  });
  const approved = subs.filter((s) => s.clientStatus === "approved");
  const rejected = subs.filter((s) => s.clientStatus === "rejected");
  const decisions = approved.length + rejected.length;

  const approvedRates = approved.map((s) => s.candidate.clientRate).filter((r): r is number => r != null);
  const rejectedRates = rejected.map((s) => s.candidate.clientRate).filter((r): r is number => r != null);
  const budgetCeilingObserved = approvedRates.length ? Math.max(...approvedRates) : null;
  const rejectsAboveRate =
    budgetCeilingObserved != null
      ? (() => {
          const above = rejectedRates.filter((r) => r > budgetCeilingObserved);
          return above.length ? Math.min(...above) : null;
        })()
      : null;

  const preferredCountries = [...new Set(approved.map((s) => s.candidate.country).filter(Boolean))] as string[];
  const englishFloor =
    approved.length
      ? approved
          .map((s) => s.candidate.englishLevel)
          .filter(Boolean)
          .sort((a, b) => englishRank(a) - englishRank(b))[0] ?? null
      : null;
  const approvalRate = decisions > 0 ? approved.length / decisions : null;

  const summaryParts: string[] = [];
  if (budgetCeilingObserved != null) summaryParts.push(`approves up to $${budgetCeilingObserved}/hr`);
  if (englishFloor) summaryParts.push(`English ≥ ${englishFloor}`);
  if (preferredCountries.length) summaryParts.push(`countries: ${preferredCountries.slice(0, 3).join(", ")}`);
  const summary = summaryParts.length ? `This client ${summaryParts.join("; ")}.` : null;

  const data = {
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    budgetCeilingObserved,
    rejectsAboveRate,
    preferredCountries: preferredCountries as Prisma.InputJsonValue,
    englishFloor,
    approvalRate,
    summary,
    source: "deterministic",
  };
  await prisma.clientInsight.upsert({ where: { clientId }, create: { clientId, ...data }, update: data });
  return true;
}

export interface ApprovalResult {
  probability: number | null; // 0-100, null = insufficient history
  confident: boolean;
  reasons: string[];
}

/**
 * Approval probability for a candidate given the client's learned insight.
 * Cold-start safe: returns null + confident=false when there's too little history.
 */
export function approvalProbability(candidate: CandidateInput, insight: ClientInsight | null): ApprovalResult {
  if (!insight) return { probability: null, confident: false, reasons: ["No client history yet."] };
  const decisions = insight.approvedCount + insight.rejectedCount;
  if (decisions < MIN_DECISIONS) return { probability: null, confident: false, reasons: ["Not enough decisions to learn this client's preferences."] };

  const reasons: string[] = [];
  let p = (insight.approvalRate ?? 0.5) * 100;

  // Budget: this client's observed ceiling is a strong signal.
  if (insight.budgetCeilingObserved != null && candidate.clientRate != null) {
    if (candidate.clientRate > insight.budgetCeilingObserved) {
      p -= 35;
      reasons.push(`Rate $${candidate.clientRate}/hr exceeds the client's observed ceiling ($${insight.budgetCeilingObserved}/hr).`);
    } else {
      p += 10;
      reasons.push(`Within the client's observed budget.`);
    }
  }
  // English floor.
  if (insight.englishFloor && englishRank(candidate.englishLevel) < englishRank(insight.englishFloor)) {
    p -= 20;
    reasons.push(`English below the client's typical floor (${insight.englishFloor}).`);
  }
  // Preferred countries.
  const countries = (insight.preferredCountries as string[]) ?? [];
  if (countries.length && candidate.country && countries.includes(candidate.country)) {
    p += 8;
    reasons.push(`From a country this client has approved before.`);
  }

  return { probability: Math.max(0, Math.min(100, Math.round(p))), confident: true, reasons };
}
