import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { recordChange } from "@/lib/crud";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// POST /api/candidates/:id/restore — un-archive AND un-delete (Mission 5.1 P1).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.candidate.update({ where: { id }, data: { archivedAt: null, deletedAt: null } });
  await recordChange({ action: "candidate_restored", entity: "candidate", entityId: id, candidateId: id, userId: auth.user.id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true, restored: true });
}
