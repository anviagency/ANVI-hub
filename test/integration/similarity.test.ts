import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { similarToCandidate } from "@/lib/matching/similarity";
import { makeCandidate, cleanupByPrefix } from "./fixtures";

// Mission 10 Phase 5 — deterministic candidate similarity (no AI/pgvector needed).
const P = "ZZSIM";
let vasyaId = "";

describe("candidate similarity engine", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    // Reference: React/Node engineer, $50/hr.
    vasyaId = await makeCandidate({ prefix: P, name: "Vasya", clientRate: 50, country: "Ukraine", englishLevel: "C1", totalYears: 7, skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 6 }, { name: "TypeScript", years: 5 }] });
    // Very similar but cheaper.
    await makeCandidate({ prefix: P, name: "Twin", clientRate: 40, country: "Ukraine", englishLevel: "C1", totalYears: 7, skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 5 }, { name: "TypeScript", years: 5 }] });
    // Unrelated (Go/Kubernetes).
    await makeCandidate({ prefix: P, name: "Gopher", clientRate: 45, country: "Poland", englishLevel: "B2", totalYears: 8, skills: [{ name: "Go", years: 7 }, { name: "Kubernetes", years: 5 }] });
  });
  afterAll(async () => {
    await cleanupByPrefix(P);
  });

  it("ranks genuinely similar candidates above unrelated ones", async () => {
    const res = await similarToCandidate(vasyaId, { limit: 10 });
    expect(res.reference?.name).toContain("Vasya");
    const twin = res.candidates.find((c) => c.name.includes("Twin"));
    const gopher = res.candidates.find((c) => c.name.includes("Gopher"));
    expect(twin).toBeTruthy();
    expect(twin!.similarity).toBeGreaterThan(gopher?.similarity ?? 0);
  });

  it("applies the 'cheaper' modifier", async () => {
    const res = await similarToCandidate(vasyaId, { limit: 10, cheaperThanRef: true });
    // Only candidates strictly cheaper than $50 (Twin $40, Gopher $45) — all < 50.
    expect(res.candidates.every((c) => (c.clientRate ?? 0) < 50)).toBe(true);
    expect(res.candidates.some((c) => c.name.includes("Twin"))).toBe(true);
  });

  it("never returns the reference candidate itself", async () => {
    const res = await similarToCandidate(vasyaId, { limit: 10 });
    expect(res.candidates.some((c) => c.id === vasyaId)).toBe(false);
  });
});
