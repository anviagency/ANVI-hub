import { prisma } from "@/lib/db";
import type { Availability } from "@prisma/client";

// Shared helpers to build isolated fixtures for DB/API integration tests.
// Everything is namespaced by a unique prefix so tests never collide with the
// seed data or each other, and cleanupByPrefix tears it all down via cascades.

export async function ensureSkill(name: string): Promise<string> {
  const s = await prisma.skill.upsert({
    where: { canonicalName: name },
    create: { canonicalName: name, synonyms: [] },
    update: {},
  });
  return s.id;
}

export async function makeClient(prefix: string): Promise<string> {
  const c = await prisma.client.create({
    data: { name: `${prefix} Client`, company: `${prefix} Co`, portalSlug: `${prefix}-${Date.now()}` },
  });
  return c.id;
}

export async function makeJob(opts: {
  prefix: string;
  clientId?: string;
  budgetMax?: number;
  experienceYearsMin?: number;
  englishLevel?: string;
  skills: { name: string; required: boolean; minYears?: number | null }[];
}): Promise<string> {
  const skillRows = [];
  for (const s of opts.skills) {
    skillRows.push({ skillId: await ensureSkill(s.name), required: s.required, minYears: s.minYears ?? null });
  }
  const job = await prisma.job.create({
    data: {
      title: `${opts.prefix} Role`,
      clientId: opts.clientId ?? null,
      seniority: "Senior",
      budgetMax: opts.budgetMax ?? 42,
      budgetUnit: "usd_hour",
      experienceYearsMin: opts.experienceYearsMin ?? 5,
      englishLevel: opts.englishLevel ?? "B2+",
      skills: { create: skillRows },
    },
  });
  return job.id;
}

export interface EmpInput {
  company: string;
  fullTime?: boolean;
  start: [number, number];
  end?: [number, number] | null;
}

export async function makeCandidate(opts: {
  prefix: string;
  name: string;
  country?: string;
  title?: string;
  englishLevel?: string;
  availability?: Availability;
  clientRate?: number;
  salaryExpectation?: number;
  careerStartYear?: number;
  totalYears?: number;
  skills: { name: string; years: number }[];
  employments?: EmpInput[];
}): Promise<string> {
  const skillRows = [];
  for (const s of opts.skills) {
    skillRows.push({ skillId: await ensureSkill(s.name), years: s.years });
  }
  const c = await prisma.candidate.create({
    data: {
      fullName: `${opts.prefix} ${opts.name}`,
      dedupeKey: `test:${opts.prefix}:${opts.name}`,
      title: opts.title ?? "Full-Stack Developer",
      country: opts.country ?? "Ukraine",
      englishLevel: opts.englishLevel ?? "B2",
      availability: opts.availability ?? "available",
      clientRate: opts.clientRate ?? 32,
      salaryExpectation: opts.salaryExpectation ?? 22,
      careerStartYear: opts.careerStartYear ?? 2018,
      totalYears: opts.totalYears ?? 7,
      skills: { create: skillRows },
      employments: opts.employments
        ? {
            create: opts.employments.map((e) => ({
              company: e.company,
              fullTime: e.fullTime ?? true,
              startDate: new Date(Date.UTC(e.start[0], e.start[1] - 1, 1)),
              endDate: e.end ? new Date(Date.UTC(e.end[0], e.end[1] - 1, 1)) : null,
            })),
          }
        : undefined,
    },
  });
  return c.id;
}

export async function cleanupByPrefix(prefix: string): Promise<void> {
  // ShareLinks reference jobs; pipelines/notes/submissions cascade from candidate/job.
  await prisma.shareLink.deleteMany({ where: { job: { title: { startsWith: prefix } } } });
  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: prefix } } });
  await prisma.job.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.client.deleteMany({ where: { name: { startsWith: prefix } } });
}
