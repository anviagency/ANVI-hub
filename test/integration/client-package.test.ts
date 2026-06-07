import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createClientPackage, resolveClientPackage } from "@/lib/package/build";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// Mission 10 Phase 6 — client package composition is anonymized + client-safe.
const P = "ZZPKG";
let jobId = "";
let candId = "";

describe("client package generation", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    const clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true }] });
    candId = await makeCandidate({ prefix: P, name: "Packaged", clientRate: 50, salaryExpectation: 30, skills: [{ name: "React", years: 6 }], employments: [{ company: "Acme", start: [2019, 1], end: null }] });
    // Give the candidate contact details + internal data that must NOT leak.
    await prisma.candidate.update({ where: { id: candId }, data: { email: "secret@example.com", phone: "+10005551234", linkedinUrl: "https://linkedin.com/in/secret", aiSummary: "Strong React engineer." } });
    await prisma.note.create({ data: { candidateId: candId, kind: "note", internal: true, body: "INTERNAL: negotiate down on rate" } });
  });
  afterAll(async () => {
    await prisma.clientPackage.deleteMany({ where: { jobId } });
    await cleanupByPrefix(P);
  });

  it("creates an anonymized, client-safe package (no contact details, no cost, no notes)", async () => {
    const pkg = await createClientPackage({ jobId, candidateIds: [candId], branding: { agencyName: "TestCo" } });
    expect(pkg).not.toBeNull();
    expect(pkg!.count).toBe(1);

    const resolved = await resolveClientPackage(pkg!.token);
    expect(resolved).not.toBeNull();
    const blob = JSON.stringify(resolved);

    // Trust boundary: none of these may appear anywhere in the package.
    expect(blob).not.toContain("secret@example.com");
    expect(blob).not.toContain("+10005551234");
    expect(blob).not.toContain("linkedin.com/in/secret");
    expect(blob).not.toContain("INTERNAL: negotiate");

    // Client-safe content IS present; internal cost field is absent.
    const item = resolved!.items[0];
    expect(item).not.toHaveProperty("salaryExpectation"); // internal cost never included
    expect(item).not.toHaveProperty("email");
    expect(item).not.toHaveProperty("phone");
    expect(item.name).toContain("Packaged");
    expect(item.rate).toBe(50); // client price is shown
    expect(item.skills).toContain("React");
    expect(item.summary).toContain("Strong React");
    expect(item.experience.length).toBeGreaterThan(0);
  });

  it("returns null when there are no candidates to package", async () => {
    const pkg = await createClientPackage({ jobId, candidateIds: [] });
    expect(pkg).toBeNull();
  });
});
