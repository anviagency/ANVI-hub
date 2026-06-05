// Availability intelligence (Mission 5.1 P5). A 0-100 confidence that the
// candidate is actually available right now, from placement status + how
// recently availability/contact/screening were confirmed. Pure + deterministic.

export interface AvailabilityInput {
  availability: "available" | "on_hold" | "placed";
  availabilityConfirmedAt?: Date | null;
  lastContactedAt?: Date | null;
  lastScreenedAt?: Date | null;
  updatedAt: Date;
}

export type AvailabilityBand = "high" | "medium" | "low";

export interface AvailabilityResult {
  score: number; // 0-100
  band: AvailabilityBand;
  lastConfirmed: Date | null;
  reasons: string[];
  rankingDelta: number; // small signed nudge for the match score
}

const DAY = 86400000;
function daysSince(a: Date | null | undefined, now: Date): number | null {
  if (!a) return null;
  return Math.max(0, Math.floor((now.getTime() - a.getTime()) / DAY));
}

export function scoreAvailability(input: AvailabilityInput, now: Date = new Date()): AvailabilityResult {
  const reasons: string[] = [];

  // Base from placement status.
  let score = input.availability === "available" ? 65 : input.availability === "on_hold" ? 35 : 5;
  reasons.push(`status: ${input.availability}`);

  // Strongest signal: an explicit availability confirmation.
  const confirmedDays = daysSince(input.availabilityConfirmedAt, now);
  if (confirmedDays !== null) {
    const bonus = confirmedDays <= 2 ? 30 : confirmedDays <= 7 ? 22 : confirmedDays <= 30 ? 12 : confirmedDays <= 90 ? 3 : -5;
    score += bonus;
    reasons.push(`availability confirmed ${confirmedDays}d ago`);
  } else {
    reasons.push("availability never explicitly confirmed");
  }

  // Secondary: recent contact / screening.
  const contactDays = daysSince(input.lastContactedAt, now);
  if (contactDays !== null && contactDays <= 7) {
    score += 5;
    reasons.push(`contacted ${contactDays}d ago`);
  }
  const screenDays = daysSince(input.lastScreenedAt, now);
  if (screenDays !== null && screenDays <= 30) {
    score += 3;
    reasons.push(`screened ${screenDays}d ago`);
  }

  // Penalty for a very stale profile with no confirmation.
  const updDays = daysSince(input.updatedAt, now) ?? 0;
  if (confirmedDays === null && updDays > 180) {
    score -= 10;
    reasons.push(`profile stale (${updDays}d)`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: AvailabilityBand = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  // Small ranking nudge: confident-available rises, low-confidence sinks.
  const rankingDelta = score >= 75 ? 4 : score >= 50 ? 1 : score < 25 ? -5 : -2;

  return {
    score,
    band,
    lastConfirmed: input.availabilityConfirmedAt ?? null,
    reasons,
    rankingDelta,
  };
}
