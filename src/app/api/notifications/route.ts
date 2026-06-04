import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/notifications?channel= — recruiter notification feed / telegram sync log.
export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get("channel") || undefined;
  const items = await prisma.notification.findMany({
    where: channel === "telegram" || channel === "recruiter" ? { channel } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    notifications: items.map((n) => ({
      id: n.id,
      channel: n.channel,
      status: n.status,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
    })),
  });
}
