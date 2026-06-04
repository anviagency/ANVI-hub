import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";

export const runtime = "nodejs";

// GET /api/whatsapp/messages — WhatsApp activity log for the notification panel.
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const candidateId = req.nextUrl.searchParams.get("candidateId") || undefined;
  const messages = await prisma.waMessage.findMany({
    where: candidateId ? { candidateId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      kind: m.kind,
      status: m.status,
      event: m.event,
      toNumber: m.toNumber,
      fromNumber: m.fromNumber,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
}
