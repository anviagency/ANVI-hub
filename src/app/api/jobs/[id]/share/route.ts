import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createShareLink } from "@/lib/share";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// GET /api/jobs/:id/share — list share links for a job (auth required).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const links = await prisma.shareLink.findMany({
    where: { jobId: id },
    include: { _count: { select: { candidates: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    links: links.map((l) => ({
      token: l.token,
      label: l.label,
      revoked: l.revoked,
      expiresAt: l.expiresAt,
      viewCount: l.viewCount,
      lastViewedAt: l.lastViewedAt,
      candidates: l._count.candidates,
      url: `/share/${l.token}`,
      createdAt: l.createdAt,
    })),
  });
}

const Body = z.object({
  label: z.string().optional(),
  clientId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  candidates: z
    .array(z.object({ candidateId: z.string(), shareNotes: z.boolean().optional() }))
    .min(1),
});

// POST /api/jobs/:id/share — mint a secure client-facing link (auth required).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  try {
    const link = await createShareLink({
      jobId: id,
      clientId: parsed.data.clientId,
      label: parsed.data.label,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      createdById: auth.user.id,
      candidates: parsed.data.candidates,
    });
    await audit({ userId: auth.user.id, action: "share_created", entity: "share_link", entityId: link.token, meta: { jobId: id, candidates: link.candidates.length }, ip: getClientIp(req) });
    return NextResponse.json({ token: link.token, url: `/share/${link.token}`, candidates: link.candidates.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
