import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalizeSkill } from "@/lib/ai/skills";

export const runtime = "nodejs";

// GET /api/jobs — list open + recent jobs for the Vacancies view.
export async function GET() {
  const jobs = await prisma.job.findMany({
    include: {
      client: true,
      skills: { include: { skill: true } },
      _count: { select: { analyses: true, submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      seniority: j.seniority,
      status: j.status,
      budgetMin: j.budgetMin,
      budgetMax: j.budgetMax,
      budgetUnit: j.budgetUnit,
      englishLevel: j.englishLevel,
      experienceYearsMin: j.experienceYearsMin,
      client: j.client ? { id: j.client.id, name: j.client.name, company: j.client.company } : null,
      skills: j.skills.map((s) => ({ name: s.skill.canonicalName, required: s.required, minYears: s.minYears })),
      analyzed: j._count.analyses,
      submitted: j._count.submissions,
      createdAt: j.createdAt,
    })),
  });
}

const Skill = z.object({
  name: z.string(),
  required: z.boolean().default(true),
  minYears: z.number().nullable().default(null),
});

const CreateJob = z.object({
  clientId: z.string().optional(),
  title: z.string().min(1),
  seniority: z.string().nullable().optional(),
  experienceYearsMin: z.number().nullable().optional(),
  englishLevel: z.string().nullable().optional(),
  budget: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      unit: z.string().nullable(),
    })
    .optional(),
  skills: z.array(Skill).default([]),
  descriptionRaw: z.string().optional(),
});

// POST /api/jobs — persist a job from the chat preview (spec §2.2).
export async function POST(req: NextRequest) {
  const parsed = CreateJob.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  // Resolve skills to canonical and connect/create skill rows.
  const skillsToConnect = [];
  for (const s of data.skills) {
    const canonical = canonicalizeSkill(s.name) ?? s.name;
    const skill = await prisma.skill.upsert({
      where: { canonicalName: canonical },
      create: { canonicalName: canonical, synonyms: [] },
      update: {},
    });
    skillsToConnect.push({ skillId: skill.id, required: s.required, minYears: s.minYears });
  }

  const job = await prisma.job.create({
    data: {
      clientId: data.clientId ?? null,
      title: data.title,
      seniority: data.seniority ?? null,
      experienceYearsMin: data.experienceYearsMin ?? null,
      englishLevel: data.englishLevel ?? null,
      budgetMin: data.budget?.min ?? null,
      budgetMax: data.budget?.max ?? null,
      budgetUnit: data.budget?.unit ?? null,
      descriptionRaw: data.descriptionRaw ?? null,
      skills: { create: skillsToConnect },
    },
    include: { client: true, skills: { include: { skill: true } } },
  });

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      seniority: job.seniority,
      status: job.status,
      client: job.client ? { id: job.client.id, name: job.client.name, company: job.client.company } : null,
      skills: job.skills.map((s) => ({ name: s.skill.canonicalName, required: s.required })),
    },
  });
}
