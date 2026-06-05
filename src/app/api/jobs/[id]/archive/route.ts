import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// POST /api/jobs/:id/archive  body {restore?:true} — archive or un-archive a job.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const restore = body?.restore === true;
  await prisma.job.update({ where: { id }, data: restore ? { archivedAt: null, deletedAt: null } : { archivedAt: new Date() } });
  await audit({ userId: auth.user.id, action: restore ? "job_restored" : "job_archived", entity: "job", entityId: id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true, archived: !restore });
}
