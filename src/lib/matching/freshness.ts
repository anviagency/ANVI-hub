import { CandidateInput, FreshnessBand, FreshnessResult } from "@/lib/types";

// Data-freshness scoring (mission Part 6). Stale candidate data is the single
// biggest source of "this person isn't actually available / accurate" failures,
// so freshness is a first-class ranking signal, not a footnote.
//
// Bands (per the brief):
//   green  — touched within 7 days
//   yellow — within 30 days
//   amber  — within 90 days
//   red    — older than 90 days
// "Touched" = the most recent of {updated, contacted}. Pure + deterministic.

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function freshnessBand(days: number): FreshnessBand {
  if (days <= 7) return "green";
  if (days <= 30) return "yellow";
  if (days <= 90) return "amber";
  return "red";
}

const BAND_DELTA: Record<FreshnessBand, number> = {
  green: 5,
  yellow: 2,
  amber: -2,
  red: -8,
};

const BAND_LABEL: Record<FreshnessBand, string> = {
  green: "Fresh",
  yellow: "Recent",
  amber: "Aging",
  red: "Stale",
};

export function scoreFreshness(
  c: Pick<CandidateInput, "updatedAt" | "lastContactedAt" | "lastScreenedAt">,
  now: Date = new Date()
): FreshnessResult {
  const daysSinceUpdated = Math.max(0, daysBetween(now, c.updatedAt));
  const daysSinceContacted = c.lastContactedAt ? Math.max(0, daysBetween(now, c.lastContactedAt)) : null;
  const daysSinceScreened = c.lastScreenedAt ? Math.max(0, daysBetween(now, c.lastScreenedAt)) : null;

  // Effective freshness uses the most recent meaningful touch.
  const effective = Math.min(
    daysSinceUpdated,
    daysSinceContacted ?? Number.POSITIVE_INFINITY
  );
  const band = freshnessBand(effective);

  // Continuous 0-100 score: linear decay, floor at 0 by ~180 days.
  const score = Math.max(0, Math.round(100 - (effective / 180) * 100));

  return {
    band,
    score,
    daysSinceUpdated,
    daysSinceContacted,
    daysSinceScreened,
    rankingDelta: BAND_DELTA[band],
    label: BAND_LABEL[band],
  };
}
