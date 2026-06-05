import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCandidateFromCv } from "@/lib/import/cv-intake";
import { createTestUser, cleanupAuth } from "./auth-helper";

const P = "ZZPDF";
let userId = "";

const CV = `Olena Petrenko
Senior React Developer
Skills: React, Node.js, TypeScript, PostgreSQL, Next.js
7 years of commercial experience building SaaS products.
English: C1
Location: Kyiv, Ukraine`;

async function cleanup() {
  await prisma.candidate.deleteMany({ where: { fullName: "Olena Petrenko" } });
  await cleanupAuth(P);
}

describe("PDF/CV import helper (createCandidateFromCv)", () => {
  beforeAll(async () => {
    await cleanup();
    userId = (await createTestUser("recruiter", P)).userId;
  });
  afterAll(cleanup);

  it("creates a candidate with parsed skills from CV text", async () => {
    const r = await createCandidateFromCv(CV, { source: "CV", userId, mode: "pdf" });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
    expect(r.name).toBe("Olena Petrenko");
    expect((r.skills ?? 0)).toBeGreaterThan(0);

    const c = await prisma.candidate.findUniqueOrThrow({ where: { id: r.id! }, include: { skills: { include: { skill: true } } } });
    expect(c.source).toBe("CV");
    expect(c.englishLevel).toBe("C1");
    expect(c.country).toBe("Ukraine");
    expect(c.skills.length).toBeGreaterThan(0);
    // skills must carry non-zero years so the candidate is matchable
    expect(c.skills.every((s) => s.years > 0)).toBe(true);
  });

  it("dedupes a re-imported identical CV instead of duplicating", async () => {
    const r = await createCandidateFromCv(CV, { source: "CV", userId, mode: "pdf" });
    expect(r.duplicate).toBe(true);
    const count = await prisma.candidate.count({ where: { fullName: "Olena Petrenko", deletedAt: null } });
    expect(count).toBe(1);
  });

  it("rejects text that is too short to be a CV", async () => {
    const r = await createCandidateFromCv("hi", { source: "CV", userId });
    expect(r.error).toBe("cv_text_too_short");
  });
});
