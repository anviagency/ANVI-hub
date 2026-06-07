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

describe("AI matching enrichment (deterministic path)", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    const clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, budgetMax: 60, experienceYearsMin: 4, skills: [{ name: "React", required: true, minYears: 3 }, { name: "Node.js", required: true, minYears: 3 }] });
    await makeCandidate({
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
    const results = await runMatch(job!, { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top.engineSource).toBe("deterministic");
    expect(top.retentionProbability).not.toBeNull();
    expect(typeof top.retentionProbability).toBe("number");
    expect(top.fitBreakdown).toBeTruthy();
    expect(top.fitBreakdown!.technical).toBeGreaterThan(0); // covers required skills
    expect(top.fitBreakdown!.availability).toBe(100); // available candidate
  });

  it("persists the enriched analysis fields", async () => {
    const job = await loadJobRow(jobId);
    const { persistAnalyses } = await import("@/lib/matching/funnel");
    const results = await runMatch(job!, { limit: 5 });
    await persistAnalyses(jobId, results);
    const row = await prisma.candidateAnalysis.findFirst({ where: { jobId } });
    expect(row?.retentionProbability).not.toBeNull();
    expect(row?.fitBreakdown).toBeTruthy();
    expect(row?.engineSource).toBe("deterministic");
  });
});
