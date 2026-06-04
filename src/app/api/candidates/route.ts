import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";

export const runtime = "nodejs";

// GET /api/candidates — talent pool list (auth required, paginated).
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const take = Math.min(Number(sp.get("limit") ?? 100), 200);
  const cursor = sp.get("cursor") ?? undefined;

  const candidates = await prisma.candidate.findMany({
    include: { skills: { include: { skill: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1, // fetch one extra to compute the next cursor
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = candidates.length > take;
  const page = hasMore ? candidates.slice(0, take) : candidates;
  return NextResponse.json({
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    candidates: page.map((c) => ({
      id: c.id,
      name: c.fullName,
      title: c.title,
      country: c.country,
      location: c.location,
      flag: c.flag,
      english: c.englishLevel,
      totalYears: c.totalYears,
      availability: c.availability,
      availabilityNote: c.availabilityNote,
      clientRate: c.clientRate,
      source: c.source,
      updatedAt: c.updatedAt,
      skills: c.skills.map((s) => s.skill.canonicalName),
    })),
  });
}
