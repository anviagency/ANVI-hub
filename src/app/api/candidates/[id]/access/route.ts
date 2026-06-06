import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import { createCandidateAccess, CandidateAccessError } from "@/lib/candidate-access";

export const runtime = "nodejs";

const Body = z.object({ jobId: z.string().optional() });

// POST /api/candidates/:id/access — mint a secure candidate self-service link
// (Mission 8 Phase 3). Recruiter-only. Returns the tokenized URL to share.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const link = await createCandidateAccess({ candidateId: id, jobId: parsed.data.jobId ?? null, createdById: auth.user.id });
    await audit({ userId: auth.user.id, action: "candidate_access_created", entity: "candidate", entityId: id, meta: { jobId: parsed.data.jobId ?? null }, ip: getClientIp(req) });
    return NextResponse.json({ token: link.token, url: `/c/${link.token}`, expiresAt: link.expiresAt }, { status: 201 });
  } catch (e) {
    if (e instanceof CandidateAccessError) return NextResponse.json({ error: e.code }, { status: e.code === "candidate_not_found" ? 404 : 400 });
    console.error("candidate access create failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
