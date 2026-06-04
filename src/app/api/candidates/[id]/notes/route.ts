import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

const KINDS = ["note", "call", "email", "telegram", "whatsapp", "interview"] as const;

const Body = z.object({
  body: z.string().min(1),
  kind: z.enum(KINDS).default("note"),
  internal: z.boolean().default(true),
  jobId: z.string().optional(),
  author: z.string().optional(),
});

// POST /api/candidates/:id/notes — add a note / communication-history entry.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const data = parsed.data;

  const note = await prisma.note.create({
    data: {
      candidateId: id,
      jobId: data.jobId ?? null,
      kind: data.kind,
      body: data.body,
      internal: data.internal,
      author: data.author ?? "Daria",
    },
  });
  await prisma.candidateEvent.create({
    data: {
      candidateId: id,
      jobId: data.jobId ?? null,
      type: data.kind === "note" ? "note_added" : "communication",
      actor: "recruiter",
      meta: { kind: data.kind },
    },
  });
  if (data.kind !== "note") {
    await prisma.candidate.update({ where: { id }, data: { lastContactedAt: new Date() } });
  }
  await audit({ userId: auth.user.id, action: "note_added", entity: "candidate", entityId: id, meta: { kind: data.kind, internal: data.internal }, ip: getClientIp(req) });

  return NextResponse.json({ note: { id: note.id, kind: note.kind, body: note.body, internal: note.internal, createdAt: note.createdAt } });
}
