import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { runMatch } from "@/lib/matching/funnel";
import { loadJobRow } from "@/lib/jobs";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// Mission 10 Phase 3 — the matching pipeline always enriches results with
// deterministic retention probability + fit breakdown (AI off in tests), and
// persists them. AI rerank is flag-gated and not exercised here (hermetic).
const P = "ZZAIMATCH";
let jobId = "";
let stableId = "";

describe("AI matching enrichment (deterministic path)", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    const clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, budgetMax: 60, experienceYearsMin: 4, skills: [{ name: "React", required: true, minYears: 3 }, { name: "Node.js", required: true, minYears: 3 }] });
    stableId = await makeCandidate({
      prefix: P, name: "Stable", clientRate: 45, englishLevel: "C1",
      skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 6 }],
      employments: [{ company: "A", start: [2016, 1], end: [2021, 1] }, { company: "B", start: [2021, 2], end: null }],
    });
  });
  afterAll(async () => {
    await cleanupByPrefix(P);
  });

  it("enriches matches with retention probability and a fit breakdown", async () => {
    const job = await loadJobRow(jobId);
    expect(job).not.toBeNull();
    const results = await runMatch(job!, { limit: 20 });
    const stable = results.find((r) => r.candidate.id === stableId);
    expect(stable).toBeTruthy();
    expect(stable!.engineSource).toBe("deterministic");
    expect(stable!.retentionProbability).not.toBeNull();
    expect(typeof stable!.retentionProbability).toBe("number");
    expect(stable!.fitBreakdown).toBeTruthy();
    expect(stable!.fitBreakdown!.technical).toBeGreaterThan(0); // covers required skills
    expect(stable!.fitBreakdown!.availability).toBe(100); // available candidate
  });

  it("persists the enriched analysis fields", async () => {
    const job = await loadJobRow(jobId);
    const { persistAnalyses } = await import("@/lib/matching/funnel");
    const results = await runMatch(job!, { limit: 20 });
    await persistAnalyses(jobId, results);
    const row = await prisma.candidateAnalysis.findUnique({ where: { candidateId_jobId: { candidateId: stableId, jobId } } });
    expect(row?.retentionProbability).not.toBeNull();
    expect(row?.fitBreakdown).toBeTruthy();
    expect(row?.engineSource).toBe("deterministic");
  });
});
