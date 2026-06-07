import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { recomputeClientInsight, approvalProbability } from "@/lib/matching/client-memory";
import { toCandidateInput } from "@/lib/matching/funnel";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// Mission 10 Phase 4 — client memory learns from decisions and yields a
// cold-start-safe approval probability (null when history is too thin).
const P = "ZZCMEM";
let clientId = "";
let jobId = "";

async function candInput(id: string) {
  const row = await prisma.candidate.findUniqueOrThrow({ where: { id }, include: { skills: { include: { skill: true } }, employments: true } });
  return toCandidateInput(row);
}

describe("client memory + approval probability", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true }] });
  });
  afterAll(async () => {
    await prisma.clientInsight.deleteMany({ where: { clientId } });
    await cleanupByPrefix(P);
  });

  it("is cold-start safe — no confident probability without history", async () => {
    const c = await makeCandidate({ prefix: P, name: "Fresh", clientRate: 40, skills: [{ name: "React", years: 5 }] });
    const res = approvalProbability(await candInput(c), null);
    expect(res.probability).toBeNull();
    expect(res.confident).toBe(false);
  });

  it("learns a budget ceiling and penalizes candidates above it", async () => {
    // History: approve a $40 candidate, reject a $70 candidate.
    const approvedC = await makeCandidate({ prefix: P, name: "Approved", clientRate: 40, country: "Ukraine", englishLevel: "C1", skills: [{ name: "React", years: 6 }] });
    const rejectedC = await makeCandidate({ prefix: P, name: "Pricey", clientRate: 70, country: "Ukraine", englishLevel: "C1", skills: [{ name: "React", years: 6 }] });
    await prisma.submission.create({ data: { clientId, jobId, candidateId: approvedC, clientStatus: "approved" } });
    await prisma.submission.create({ data: { clientId, jobId, candidateId: rejectedC, clientStatus: "rejected" } });

    await recomputeClientInsight(clientId);
    const insight = await prisma.clientInsight.findUniqueOrThrow({ where: { clientId } });
    expect(insight.budgetCeilingObserved).toBe(40);
    expect(insight.approvedCount).toBe(1);
    expect(insight.rejectedCount).toBe(1);

    // A cheap candidate scores higher than an expensive one for this client.
    const cheap = await makeCandidate({ prefix: P, name: "Cheap", clientRate: 38, country: "Ukraine", englishLevel: "C1", skills: [{ name: "React", years: 6 }] });
    const dear = await makeCandidate({ prefix: P, name: "Dear", clientRate: 80, country: "Ukraine", englishLevel: "C1", skills: [{ name: "React", years: 6 }] });
    const cheapP = approvalProbability(await candInput(cheap), insight);
    const dearP = approvalProbability(await candInput(dear), insight);
    expect(cheapP.confident).toBe(true);
    expect(cheapP.probability!).toBeGreaterThan(dearP.probability!);
  });
});
