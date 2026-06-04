import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applyStage, isStage, PipelineTransitionError, STAGES } from "@/lib/pipeline";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

// GET /api/pipeline?jobId=&stage=&country=&skill=&minRate=&maxRate=&availability=&q=
// The pipeline board / filtered candidate search (mission item 4). Auth required.
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const jobId = sp.get("jobId") || undefined;
  const stage = sp.get("stage") || undefined;
  const country = sp.get("country") || undefined;
  const skill = sp.get("skill") || undefined;
  const availability = sp.get("availability") || undefined;
  const minRate = sp.get("minRate") ? Number(sp.get("minRate")) : undefined;
  const maxRate = sp.get("maxRate") ? Number(sp.get("maxRate")) : undefined;
  const q = sp.get("q")?.trim().toLowerCase() || undefined;

  const where: Prisma.PipelineWhereInput = {};
  if (jobId) where.jobId = jobId;
  if (stage && isStage(stage)) where.stage = stage;

  const candidateWhere: Prisma.CandidateWhereInput = {};
  if (country) candidateWhere.country = { equals: country, mode: "insensitive" };
  if (availability && ["available", "on_hold", "placed"].includes(availability))
    candidateWhere.availability = availability as Prisma.CandidateWhereInput["availability"];
  if (minRate != null || maxRate != null)
    candidateWhere.clientRate = { ...(minRate != null ? { gte: minRate } : {}), ...(maxRate != null ? { lte: maxRate } : {}) };
  if (skill) candidateWhere.skills = { some: { skill: { canonicalName: { equals: skill, mode: "insensitive" } } } };
  if (q) candidateWhere.fullName = { contains: q, mode: "insensitive" };
  if (Object.keys(candidateWhere).length > 0) where.candidate = candidateWhere;

  const entries = await prisma.pipeline.findMany({
    where,
    include: {
      candidate: { include: { skills: { include: { skill: true } } } },
      job: { select: { id: true, title: true } },
    },
    orderBy: [{ stage: "asc" }, { enteredStageAt: "desc" }],
  });

  return NextResponse.json({
    stages: STAGES,
    entries: entries.map((e) => ({
      id: e.id,
      stage: e.stage,
      enteredStageAt: e.enteredStageAt,
      job: e.job,
      candidate: {
        id: e.candidate.id,
        name: e.candidate.fullName,
        title: e.candidate.title,
        country: e.candidate.country,
        flag: e.candidate.flag,
        english: e.candidate.englishLevel,
        availability: e.candidate.availability,
        clientRate: e.candidate.clientRate,
        skills: e.candidate.skills.map((s) => s.skill.canonicalName),
      },
    })),
  });
}

const Move = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
  stage: z.string().min(1),
  feedback: z.string().optional(),
});

// POST /api/pipeline — move a candidate to a stage (transition + event + notify). Auth required.
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const parsed = Move.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { candidateId, jobId, stage, feedback } = parsed.data;
  if (!isStage(stage)) return NextResponse.json({ error: `Unknown stage: ${stage}` }, { status: 400 });

  try {
    const result = await applyStage({ candidateId, jobId, to: stage, actor: "recruiter", feedback });
    await audit({ userId: auth.user.id, action: "pipeline_move", entity: "candidate", entityId: candidateId, meta: { jobId, from: result.from, to: result.to }, ip: getClientIp(req) });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof PipelineTransitionError) {
      return NextResponse.json({ error: e.message, from: e.from, to: e.to }, { status: 409 });
    }
    console.error("pipeline move failed", e);
    return NextResponse.json({ error: "Move failed" }, { status: 500 });
  }
}
