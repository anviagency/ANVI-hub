import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { loadJobRow } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { getFreshAnalysis, isCacheFresh } from "@/lib/matching/cache";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// DB integration: candidate_analysis cache is actually read + invalidated (P2).
const P = "ZZCACHE";
let jobId = "";
let candId = "";

describe("analysis cache (DB)", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    const clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true, minYears: 4 }, { name: "Node.js", required: true, minYears: 3 }] });
    candId = await makeCandidate({ prefix: P, name: "Cacher", clientRate: 34, skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 7 }] });
    // Populate the cache (what analyze_job / POST match does).
    const job = await loadJobRow(jobId);
    const results = await runMatch(job!, { limit: 10 });
    await persistAnalyses(jobId, results);
  });
  afterAll(() => cleanupByPrefix(P));

  it("isCacheFresh respects candidate and job timestamps", () => {
    const t = new Date("2026-06-04");
    const older = new Date("2026-06-01");
    const newer = new Date("2026-06-10");
    expect(isCacheFresh(t, older, older)).toBe(true);
    expect(isCacheFresh(t, newer, older)).toBe(false); // candidate changed after analysis
    expect(isCacheFresh(t, older, newer)).toBe(false); // job changed after analysis
  });

  it("returns a cache HIT for an unchanged candidate+job", async () => {
    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: candId } });
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const res = await getFreshAnalysis(candId, jobId, cand.updatedAt, job.updatedAt);
    expect(res.hit).toBe(true);
    expect(res.analysis?.matchScore).toBeGreaterThan(0);
  });

  it("invalidates the cache (MISS) after the candidate is updated", async () => {
    // Touch the candidate so updatedAt moves past analyzedAt.
    await prisma.candidate.update({ where: { id: candId }, data: { availabilityNote: "touched" } });
    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: candId } });
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const res = await getFreshAnalysis(candId, jobId, cand.updatedAt, job.updatedAt);
    expect(res.hit).toBe(false);
    expect(res.stale).toBe(true);
  });
});
