import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

// GET /api/placements?clientId=&status= — the workforce / placements board.
// Closes the funnel (spec §8): every hire surfaces here with its start date and
// onboarding status. Internal salary is intentionally NOT projected — the price
// (clientRate) is the only commercial field exposed.
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const where: Prisma.PlacementWhereInput = {};
  const clientId = sp.get("clientId");
  const status = sp.get("status");
  if (clientId) where.clientId = clientId;
  if (status) where.status = status;

  const placements = await prisma.placement.findMany({
    where,
    include: {
      candidate: { select: { id: true, fullName: true, title: true, country: true, flag: true } },
      client: { select: { id: true, name: true, company: true } },
      job: { select: { id: true, title: true } },
      offer: { select: { id: true, status: true, currency: true } },
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  return NextResponse.json({
    placements: placements.map((p) => ({
      id: p.id,
      status: p.status,
      onboardingStatus: p.onboardingStatus,
      title: p.title,
      clientRate: p.clientRate,
      currency: p.offer?.currency ?? "usd",
      startDate: p.startDate,
      endDate: p.endDate,
      notes: p.notes,
      createdAt: p.createdAt,
      candidate: p.candidate ? { id: p.candidate.id, name: p.candidate.fullName, title: p.candidate.title, country: p.candidate.country, flag: p.candidate.flag } : null,
      client: p.client ? { id: p.client.id, name: p.client.name, company: p.client.company } : null,
      job: p.job,
      offerId: p.offer?.id ?? null,
    })),
  });
}
