import { describe, it, expect } from "vitest";
import { scoreFreshness, freshnessBand, daysBetween } from "./freshness";

const NOW = new Date("2026-06-04T00:00:00Z");
function daysAgo(n: number) {
  return new Date(NOW.getTime() - n * 86400000);
}

describe("freshnessBand", () => {
  it("maps day counts to the brief's bands", () => {
    expect(freshnessBand(0)).toBe("green");
    expect(freshnessBand(7)).toBe("green");
    expect(freshnessBand(8)).toBe("yellow");
    expect(freshnessBand(30)).toBe("yellow");
    expect(freshnessBand(60)).toBe("amber");
    expect(freshnessBand(91)).toBe("red");
  });
});

describe("scoreFreshness", () => {
  it("green for a profile updated within 7 days", () => {
    const f = scoreFreshness({ updatedAt: daysAgo(3), lastContactedAt: null, lastScreenedAt: null }, NOW);
    expect(f.band).toBe("green");
    expect(f.rankingDelta).toBeGreaterThan(0);
    expect(f.daysSinceUpdated).toBe(3);
  });

  it("red and penalized for a profile older than 90 days", () => {
    const f = scoreFreshness({ updatedAt: daysAgo(200), lastContactedAt: null, lastScreenedAt: null }, NOW);
    expect(f.band).toBe("red");
    expect(f.rankingDelta).toBeLessThan(0);
    expect(f.score).toBe(0);
  });

  it("a recent contact freshens an otherwise stale profile", () => {
    const stale = scoreFreshness({ updatedAt: daysAgo(120), lastContactedAt: null, lastScreenedAt: null }, NOW);
    const contacted = scoreFreshness({ updatedAt: daysAgo(120), lastContactedAt: daysAgo(2), lastScreenedAt: null }, NOW);
    expect(stale.band).toBe("red");
    expect(contacted.band).toBe("green");
    expect(contacted.score).toBeGreaterThan(stale.score);
  });

  it("daysBetween is whole-day and order-sensitive", () => {
    expect(daysBetween(NOW, daysAgo(10))).toBe(10);
  });
});
