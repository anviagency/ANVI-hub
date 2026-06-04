import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/candidates — talent pool list for the Candidates view.
export async function GET() {
  const candidates = await prisma.candidate.findMany({
    include: { skills: { include: { skill: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    candidates: candidates.map((c) => ({
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
