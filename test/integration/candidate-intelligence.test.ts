import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { upsertCandidateIntelligence } from "@/lib/ai/candidate-intelligence";
import { makeCandidate, cleanupByPrefix } from "./fixtures";

// Mission 10 Phase 2 — the deterministic intelligence extractor (AI off in tests)
// categorizes existing skills and derives employment numerics into a stored,
// structured intelligence object.
const P = "ZZINTEL";
let candId = "";

describe("candidate intelligence (deterministic extraction)", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    candId = await makeCandidate({
      prefix: P,
      name: "Polyglot",
      skills: [
        { name: "Python", years: 7 },
        { name: "React", years: 5 },
        { name: "AWS", years: 4 },
        { name: "PostgreSQL", years: 6 },
        { name: "Docker", years: 3 },
      ],
      employments: [
        { company: "A Corp", start: [2016, 1], end: [2020, 1] },
        { company: "B Corp", start: [2020, 2], end: null },
      ],
    });
  });
  afterAll(async () => {
    await cleanupByPrefix(P);
  });

  it("builds and stores a structured intelligence object", async () => {
    const ok = await upsertCandidateIntelligence(candId);
    expect(ok).toBe(true);

    const intel = await prisma.candidateIntelligence.findUniqueOrThrow({ where: { candidateId: candId } });
    expect(intel.source).toBe("deterministic"); // AI off in tests

    const langs = (intel.languages as { name: string }[]).map((s) => s.name);
    const fw = (intel.frameworks as { name: string }[]).map((s) => s.name);
    const cloud = (intel.cloudProviders as { name: string }[]).map((s) => s.name);
    const db = (intel.databases as { name: string }[]).map((s) => s.name);
    const devops = (intel.devopsTools as { name: string }[]).map((s) => s.name);

    expect(langs).toContain("Python");
    expect(fw).toContain("React");
    expect(cloud).toContain("AWS");
    expect(db).toContain("PostgreSQL");
    expect(devops).toContain("Docker");

    // Employment numerics derived deterministically.
    expect(intel.stabilityScore).not.toBeNull();
    expect(intel.avgTenureMonths).not.toBeNull();
  });

  it("is idempotent (re-running updates, not duplicates)", async () => {
    await upsertCandidateIntelligence(candId);
    const count = await prisma.candidateIntelligence.count({ where: { candidateId: candId } });
    expect(count).toBe(1);
  });
});
