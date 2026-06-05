import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { canonicalizeSkill } from "@/lib/ai/skills";
import { parseCv } from "@/lib/ai/cv-parser";
import { dedupeKeyFor } from "@/lib/import/ingest";
import { recordChange } from "@/lib/crud";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

const SOURCES = ["LinkedIn", "Telegram", "Referral", "Email", "Import", "Manual", "CV"] as const;

const CreateCandidate = z.object({
  mode: z.enum(["manual", "cv", "linkedin"]).default("manual"),
  source: z.enum(SOURCES).optional(),
  // manual fields
  fullName: z.string().optional(),
  title: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  englishLevel: z.string().optional(),
  totalYears: z.number().optional(),
  clientRate: z.number().optional(),
  salaryExpectation: z.number().optional(),
  availability: z.enum(["available", "on_hold", "placed"]).optional(),
  skills: z.array(z.object({ name: z.string(), years: z.number().default(2) })).optional(),
  // cv
  cvText: z.string().optional(),
  // linkedin
  linkedinUrl: z.string().optional(),
});

// POST /api/candidates — single-candidate intake (Mission 5.1 P2):
// mode = manual | cv (AI extract) | linkedin (placeholder adapter).
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const parsed = CreateCandidate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;

  let fields: {
    fullName: string | null; title: string | null; country: string | null; location?: string | null;
    email: string | null; phone?: string | null; englishLevel: string | null; totalYears: number | null;
    clientRate: number | null; salaryExpectation?: number | null; availability: "available" | "on_hold" | "placed";
    skills: { name: string; years: number }[]; cvText?: string | null; linkedinUrl?: string | null; source: string;
  };

  if (b.mode === "cv") {
    if (!b.cvText) return NextResponse.json({ error: "cvText required for mode=cv" }, { status: 400 });
    const cv = await parseCv(b.cvText);
    fields = {
      fullName: cv.fullName, title: cv.title, country: cv.country, email: b.email ?? null,
      englishLevel: cv.englishLevel, totalYears: cv.totalYears, clientRate: b.clientRate ?? null,
      availability: b.availability ?? "available", skills: cv.skills, cvText: b.cvText, source: b.source ?? "CV",
    };
  } else if (b.mode === "linkedin") {
    if (!b.linkedinUrl) return NextResponse.json({ error: "linkedinUrl required for mode=linkedin" }, { status: 400 });
    // Placeholder adapter: store the URL now, prepare for future enrichment.
    const slugName = b.fullName ?? deriveNameFromLinkedin(b.linkedinUrl);
    fields = {
      fullName: slugName, title: b.title ?? null, country: b.country ?? null, email: b.email ?? null,
      englishLevel: null, totalYears: null, clientRate: b.clientRate ?? null,
      availability: b.availability ?? "available", skills: (b.skills ?? []).map((s) => ({ name: canonicalizeSkill(s.name) ?? s.name, years: s.years })),
      linkedinUrl: b.linkedinUrl, source: b.source ?? "LinkedIn",
    };
  } else {
    if (!b.fullName) return NextResponse.json({ error: "fullName required for mode=manual" }, { status: 400 });
    fields = {
      fullName: b.fullName, title: b.title ?? null, country: b.country ?? null, location: b.location ?? null,
      email: b.email ?? null, phone: b.phone ?? null, englishLevel: b.englishLevel ?? null,
      totalYears: b.totalYears ?? null, clientRate: b.clientRate ?? null, salaryExpectation: b.salaryExpectation ?? null,
      availability: b.availability ?? "available",
      skills: (b.skills ?? []).map((s) => ({ name: canonicalizeSkill(s.name) ?? s.name, years: s.years })),
      source: b.source ?? "Manual",
    };
  }

  if (!fields.fullName) return NextResponse.json({ error: "could_not_determine_name" }, { status: 422 });

  // Dedupe: if an identical candidate already exists, return it instead of duplicating.
  const key = dedupeKeyFor({ email: fields.email, fullName: fields.fullName, country: fields.country });
  if (key) {
    const dup = await prisma.candidate.findUnique({ where: { dedupeKey: key } });
    if (dup && !dup.deletedAt) return NextResponse.json({ duplicate: true, id: dup.id, message: "Candidate already exists" }, { status: 200 });
  }

  // Resolve skills to ids.
  const skillRows = [];
  for (const s of fields.skills) {
    const skill = await prisma.skill.upsert({ where: { canonicalName: s.name }, create: { canonicalName: s.name, synonyms: [] }, update: {} });
    skillRows.push({ skillId: skill.id, years: s.years });
  }

  const candidate = await prisma.candidate.create({
    data: {
      fullName: fields.fullName, title: fields.title, country: fields.country, location: fields.location ?? null,
      email: fields.email, phone: fields.phone ?? null, englishLevel: fields.englishLevel, totalYears: fields.totalYears,
      careerStartYear: fields.totalYears ? new Date().getUTCFullYear() - Math.round(fields.totalYears) : null,
      clientRate: fields.clientRate, salaryExpectation: fields.salaryExpectation ?? null, availability: fields.availability,
      cvText: fields.cvText ?? null, linkedinUrl: fields.linkedinUrl ?? null, source: fields.source,
      availabilityConfirmedAt: new Date(), // a just-added candidate is freshly confirmed
      dedupeKey: key ?? `manual:${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      skills: { create: skillRows },
    },
  });

  await recordChange({ action: "candidate_created", entity: "candidate", entityId: candidate.id, candidateId: candidate.id, eventType: "created", userId: auth.user.id, ip: getClientIp(req), meta: { mode: b.mode, source: fields.source } });
  return NextResponse.json({ id: candidate.id, name: candidate.fullName, source: candidate.source, skills: fields.skills.length });
}

function deriveNameFromLinkedin(url: string): string {
  const m = url.match(/\/in\/([^/?#]+)/i);
  if (!m) return "LinkedIn Candidate";
  return m[1].replace(/[-_]+/g, " ").replace(/\d+/g, "").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || "LinkedIn Candidate";
}

// GET /api/candidates — talent pool list (auth required, paginated).
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const take = Math.min(Number(sp.get("limit") ?? 100), 200);
  const cursor = sp.get("cursor") ?? undefined;
  const includeArchived = sp.get("archived") === "1";

  const candidates = await prisma.candidate.findMany({
    where: {
      deletedAt: null, // never show soft-deleted
      ...(includeArchived ? {} : { archivedAt: null }),
    },
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
