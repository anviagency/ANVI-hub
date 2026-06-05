import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import { z } from "zod";

export const runtime = "nodejs";

const EditJob = z.object({
  title: z.string().min(1).optional(),
  seniority: z.string().nullable().optional(),
  experienceYearsMin: z.number().nullable().optional(),
  englishLevel: z.string().nullable().optional(),
  budgetMin: z.number().nullable().optional(),
  budgetMax: z.number().nullable().optional(),
  status: z.enum(["open", "paused", "filled"]).optional(),
  clientId: z.string().nullable().optional(),
});

// PATCH /api/jobs/:id — edit a job (Mission 5.1 P1).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job || job.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = EditJob.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  await prisma.job.update({ where: { id }, data: parsed.data });
  await audit({ userId: auth.user.id, action: "job_edited", entity: "job", entityId: id, meta: { fields: Object.keys(parsed.data) }, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
}

// DELETE /api/jobs/:id — soft delete (recoverable).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.job.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: auth.user.id, action: "job_deleted", entity: "job", entityId: id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true, deleted: true });
}

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
