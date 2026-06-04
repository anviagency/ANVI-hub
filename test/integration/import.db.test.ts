import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { ingestRows, ColumnMapping } from "@/lib/import/ingest";

// DB integration: import → dedupe → update existing → track last-updated + source.
const EMAIL = "import.test+dedupe@anvi.example";
const mapping: ColumnMapping = {
  fullName: "Name",
  email: "Email",
  country: "Country",
  title: "Title",
  clientRate: "Rate",
  skills: "Skills",
  availability: "Availability",
  source: "Source",
};

async function cleanup() {
  // Identity is the stable dedupeKey (lowercased email), even though a re-import
  // may overwrite the stored email field with a different-cased value.
  await prisma.candidate.deleteMany({ where: { dedupeKey: `email:${EMAIL.toLowerCase()}` } });
  await prisma.candidate.deleteMany({ where: { email: { in: [EMAIL, EMAIL.toUpperCase()] } } });
  await prisma.importBatch.deleteMany({ where: { filename: { in: ["first.csv", "second.csv"] } } });
}

describe("ingestRows (DB)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("creates a new candidate on first import", async () => {
    const rows = [
      { Name: "Dedupe Tester", Email: EMAIL, Country: "Ukraine", Title: "Full-Stack Developer", Rate: "$30/hr", Skills: "React, Node", Availability: "available", Source: "LinkedIn" },
    ];
    const summary = await ingestRows(rows, mapping, { filename: "first.csv", source: "LinkedIn" });
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);

    const c = await prisma.candidate.findFirst({ where: { email: EMAIL }, include: { skills: true } });
    expect(c).not.toBeNull();
    expect(c!.clientRate).toBe(30);
    expect(c!.source).toBe("LinkedIn");
    expect(c!.skills.length).toBe(2);
    expect(c!.dedupeKey).toBe(`email:${EMAIL.toLowerCase()}`);
  });

  it("updates the existing candidate on re-import (no duplicate)", async () => {
    const before = await prisma.candidate.findFirstOrThrow({ where: { email: EMAIL } });

    const rows = [
      { Name: "Dedupe Tester", Email: EMAIL.toUpperCase(), Country: "Ukraine", Title: "Senior Full-Stack Developer", Rate: "$38/hr", Skills: "React, Node, PostgreSQL", Availability: "on hold", Source: "Referral" },
    ];
    const summary = await ingestRows(rows, mapping, { filename: "second.csv", source: "Referral" });
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(1);

    // Still exactly one candidate with that identity.
    const all = await prisma.candidate.findMany({ where: { email: { in: [EMAIL, EMAIL.toUpperCase()] } } });
    expect(all.length).toBe(1);

    const after = await prisma.candidate.findFirstOrThrow({ where: { id: before.id }, include: { skills: true } });
    expect(after.clientRate).toBe(38); // updated
    expect(after.title).toBe("Senior Full-Stack Developer");
    expect(after.availability).toBe("on_hold");
    expect(after.source).toBe("Referral");
    expect(after.skills.length).toBe(3); // merged in PostgreSQL
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(after.createdAt.getTime());
  });

  it("skips rows with no name", async () => {
    const summary = await ingestRows([{ Name: "", Email: "x@y.z" }], mapping, { filename: "first.csv" });
    expect(summary.skipped).toBe(1);
    expect(summary.created).toBe(0);
  });
});
