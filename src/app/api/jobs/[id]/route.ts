import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";

export const runtime = "nodejs";

// GET /api/jobs/:id — a single job with its skills and client (auth required).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      client: true,
      skills: { include: { skill: true } },
      analyses: { orderBy: { matchScore: "desc" }, include: { candidate: true } },
    },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      seniority: job.seniority,
      status: job.status,
      budgetMin: job.budgetMin,
      budgetMax: job.budgetMax,
      budgetUnit: job.budgetUnit,
      englishLevel: job.englishLevel,
      experienceYearsMin: job.experienceYearsMin,
      descriptionRaw: job.descriptionRaw,
      client: job.client ? { id: job.client.id, name: job.client.name, company: job.client.company } : null,
      skills: job.skills.map((s) => ({ name: s.skill.canonicalName, required: s.required, minYears: s.minYears })),
      analyses: job.analyses.map((a) => ({
        candidateId: a.candidateId,
        name: a.candidate.fullName,
        matchScore: a.matchScore,
        recommendation: a.recommendation,
      })),
    },
  });
}
