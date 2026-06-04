import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createShareLink } from "@/lib/share";

export const runtime = "nodejs";

// GET /api/jobs/:id/share — list share links for a job.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

// POST /api/jobs/:id/share — mint a secure client-facing link for selected candidates.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  try {
    const link = await createShareLink({
      jobId: id,
      clientId: parsed.data.clientId,
      label: parsed.data.label,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      candidates: parsed.data.candidates,
    });
    return NextResponse.json({ token: link.token, url: `/share/${link.token}`, candidates: link.candidates.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
