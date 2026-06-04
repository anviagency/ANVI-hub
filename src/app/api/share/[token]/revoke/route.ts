import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revokeShareLink } from "@/lib/share";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// POST /api/share/:token/revoke — recruiter/admin revokes a share link.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const { token } = await params;
  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await revokeShareLink(token, auth.user.id);
  await audit({ userId: auth.user.id, action: "share_revoked", entity: "share_link", entityId: token, ip: getClientIp(req) });
  return NextResponse.json({ ok: true, revoked: true });
}
