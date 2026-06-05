import { describe, it, expect } from "vitest";
import { scoreAvailability } from "./availability";

const NOW = new Date("2026-06-04T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

describe("scoreAvailability", () => {
  it("is high when available and recently confirmed", () => {
    const r = scoreAvailability({ availability: "available", availabilityConfirmedAt: daysAgo(1), lastContactedAt: daysAgo(1), updatedAt: daysAgo(1) }, NOW);
    expect(r.band).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.rankingDelta).toBeGreaterThan(0);
  });

  it("is low for a placed candidate", () => {
    const r = scoreAvailability({ availability: "placed", updatedAt: daysAgo(5) }, NOW);
    expect(r.band).toBe("low");
    expect(r.rankingDelta).toBeLessThan(0);
  });

  it("drops when availability was never confirmed and the profile is stale", () => {
    const recent = scoreAvailability({ availability: "available", availabilityConfirmedAt: daysAgo(2), updatedAt: daysAgo(2) }, NOW);
    const stale = scoreAvailability({ availability: "available", availabilityConfirmedAt: null, updatedAt: daysAgo(300) }, NOW);
    expect(stale.score).toBeLessThan(recent.score);
    expect(stale.reasons.join(" ")).toMatch(/never|stale/);
  });
});
