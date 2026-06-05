import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { recordChange } from "@/lib/crud";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

const EditNote = z.object({ body: z.string().min(1).optional(), internal: z.boolean().optional() });

// PATCH /api/notes/:id — edit a note (Mission 5.1 P1).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = EditNote.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  await prisma.note.update({ where: { id }, data: { ...parsed.data, editedAt: new Date() } });
  await recordChange({ action: "note_edited", entity: "note", entityId: id, candidateId: note.candidateId, jobId: note.jobId, userId: auth.user.id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
}

// DELETE /api/notes/:id — soft delete (recoverable).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.note.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordChange({ action: "note_deleted", entity: "note", entityId: id, candidateId: note.candidateId, jobId: note.jobId, userId: auth.user.id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true, deleted: true });
}
