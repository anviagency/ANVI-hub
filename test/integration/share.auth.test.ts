import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createShareLink, resolveShareLink, recordDecision, revokeShareLink, ShareError } from "@/lib/share";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

const P = "ZZSHARE";
let jobId = "";
let aId = "";
let bId = "";
let cId = "";
let token = "";

describe("client share link authorization (DB)", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    const clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true }] });
    aId = await makeCandidate({ prefix: P, name: "Shared-A", clientRate: 30, salaryExpectation: 20, skills: [{ name: "React", years: 6 }] });
    bId = await makeCandidate({ prefix: P, name: "Shared-B", clientRate: 34, salaryExpectation: 24, skills: [{ name: "React", years: 5 }] });
    cId = await makeCandidate({ prefix: P, name: "NotShared-C", skills: [{ name: "React", years: 4 }] });

    // A has both a client-safe note and an internal note; B has a client-safe note.
    await prisma.note.create({ data: { candidateId: aId, jobId, body: "CLIENTSAFE-A available in 2 weeks", internal: false } });
    await prisma.note.create({ data: { candidateId: aId, jobId, body: "INTERNAL-A push for margin", internal: true } });
    await prisma.note.create({ data: { candidateId: bId, jobId, body: "CLIENTSAFE-B strong comms", internal: false } });

    const link = await createShareLink({
      jobId,
      clientId,
      label: "Top picks",
      candidates: [
        { candidateId: aId, shareNotes: true }, // notes opted in
        { candidateId: bId, shareNotes: false }, // notes hidden
      ],
    });
    token = link.token;
  });
  afterAll(() => cleanupByPrefix(P));

  it("exposes only the shared candidates", async () => {
    const view = await resolveShareLink(token);
    const ids = view.candidates.map((c) => c.id);
    expect(ids).toContain(aId);
    expect(ids).toContain(bId);
    expect(ids).not.toContain(cId);
  });

  it("never leaks internal cost or raw anomalies; rate is the client price", async () => {
    const view = await resolveShareLink(token);
    const a = view.candidates.find((c) => c.id === aId)!;
    expect(a.rate).toBe(30); // clientRate, not salaryExpectation
    // The client-safe shape has no anomalies / salaryExpectation keys at all.
    expect((a as unknown as Record<string, unknown>).anomalies).toBeUndefined();
    expect((a as unknown as Record<string, unknown>).salaryExpectation).toBeUndefined();
    // Risks ARE allowed for the client.
    expect(Array.isArray(a.risks)).toBe(true);
  });

  it("surfaces client-safe notes only when shareNotes is opted in — and NEVER internal notes", async () => {
    const view = await resolveShareLink(token);
    const a = view.candidates.find((c) => c.id === aId)!; // shareNotes: true
    const b = view.candidates.find((c) => c.id === bId)!; // shareNotes: false
    // A opted in: sees the client-safe note, but the internal note must not leak.
    expect(a.sharedNotes.some((n) => n.body.includes("CLIENTSAFE-A"))).toBe(true);
    expect(a.sharedNotes.some((n) => n.body.includes("INTERNAL-A"))).toBe(false);
    // B did not opt in: no notes at all.
    expect(b.sharedNotes.length).toBe(0);
  });

  it("rejects an unknown token", async () => {
    await expect(resolveShareLink("nope-not-a-token")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects an expired link", async () => {
    const expired = await createShareLink({
      jobId,
      label: "expired",
      expiresAt: new Date(Date.now() - 60_000),
      candidates: [{ candidateId: aId }],
    });
    await expect(resolveShareLink(expired.token)).rejects.toMatchObject({ code: "expired" });
  });

  it("rejects a revoked link", async () => {
    const link = await createShareLink({ jobId, label: "revokeme", candidates: [{ candidateId: aId }] });
    await revokeShareLink(link.token);
    await expect(resolveShareLink(link.token)).rejects.toMatchObject({ code: "revoked" });
  });

  it("lets the client approve a shared candidate (updates pipeline + submission)", async () => {
    const result = await recordDecision(token, aId, "approve");
    expect(result.stage).toBe("approved");
    const pipe = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: aId, jobId } } });
    expect(pipe?.stage).toBe("approved");
    const sub = await prisma.submission.findUnique({ where: { jobId_candidateId: { jobId, candidateId: aId } } });
    expect(sub?.clientStatus).toBe("approved");
    const ev = await prisma.candidateEvent.findMany({ where: { candidateId: aId, type: "client_approved" } });
    expect(ev.length).toBeGreaterThan(0);
  });

  it("forbids a decision on a candidate not on the link", async () => {
    await expect(recordDecision(token, cId, "approve")).rejects.toMatchObject({ code: "candidate_not_shared" });
  });

  it("ShareError is the typed error surface", () => {
    expect(new ShareError("revoked").code).toBe("revoked");
  });
});
