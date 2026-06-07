import { prisma } from "@/lib/db";
import { parseCv } from "@/lib/ai/cv-parser";
import { dedupeKeyFor } from "@/lib/import/ingest";
import { recordChange } from "@/lib/crud";
import { enqueue } from "@/lib/queue/queue";

export interface CvIntakeResult {
  id?: string;
  name?: string | null;
  skills?: number;
  duplicate?: boolean;
  error?: string;
  nameConfidence?: "high" | "low" | "none";
  warnings?: string[];
}

/**
 * Create a candidate from raw CV text (shared by manual CV paste and PDF upload).
 * Runs the deterministic CV parser, dedupes, and records an audit + timeline event.
 */
export async function createCandidateFromCv(
  cvText: string,
  opts: { source?: string; userId: string; ip?: string | null; mode?: string }
): Promise<CvIntakeResult> {
  const text = cvText.trim();
  if (text.length < 20) return { error: "cv_text_too_short" };

  const cv = await parseCv(text);
  // Never invent a name: if the parser couldn't find a real name (and no email to
  // derive one from), refuse rather than store a title/placeholder as a person.
  if (!cv.fullName) return { error: "could_not_determine_name", warnings: cv.warnings };

  const key = dedupeKeyFor({ email: cv.email, fullName: cv.fullName, country: cv.country });
  if (key) {
    const dup = await prisma.candidate.findUnique({ where: { dedupeKey: key } });
    if (dup && !dup.deletedAt) return { duplicate: true, id: dup.id, name: dup.fullName };
  }

  const skillRows = [];
  for (const s of cv.skills) {
    const skill = await prisma.skill.upsert({ where: { canonicalName: s.name }, create: { canonicalName: s.name, synonyms: [] }, update: {} });
    skillRows.push({ skillId: skill.id, years: s.years });
  }

  const monthToDate = (ym: string | null): Date | null => {
    if (!ym) return null;
    const m = ym.match(/^(\d{4})-(\d{1,2})/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)) : null;
  };
  const employmentRows = cv.employments
    .filter((e) => e.company)
    .map((e) => ({ company: e.company, title: e.title ?? "—", startDate: monthToDate(e.start) ?? new Date(Date.UTC(2000, 0, 1)), endDate: monthToDate(e.end), fullTime: true }));

  const candidate = await prisma.candidate.create({
    data: {
      fullName: cv.fullName,
      email: cv.email,
      phone: cv.phone,
      location: cv.location,
      title: cv.title,
      country: cv.country,
      englishLevel: cv.englishLevel,
      totalYears: cv.totalYears,
      careerStartYear: cv.totalYears ? new Date().getUTCFullYear() - Math.round(cv.totalYears) : null,
      aiSummary: cv.summary,
      source: opts.source ?? "CV",
      cvText: text,
      availability: "available",
      availabilityConfirmedAt: new Date(),
      dedupeKey: key ?? `cv:${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      skills: { create: skillRows },
      ...(employmentRows.length ? { employments: { create: employmentRows } } : {}),
    },
  });

  // Persist a parser warning so a low-confidence name is visible and verifiable.
  if (cv.nameConfidence !== "high") {
    await prisma.note.create({
      data: {
        candidateId: candidate.id, kind: "note", internal: true, author: "ANVI Parser",
        body: `⚠️ Name confidence: ${cv.nameConfidence}. ${cv.warnings.join(", ") || "verify the candidate's name"}.`,
      },
    }).catch(() => {});
  }

  await recordChange({
    action: "candidate_created", entity: "candidate", entityId: candidate.id, candidateId: candidate.id,
    eventType: "created", userId: opts.userId, ip: opts.ip ?? undefined,
    meta: { mode: opts.mode ?? "cv", source: candidate.source, nameConfidence: cv.nameConfidence, warnings: cv.warnings },
  });

  // Build the Candidate Intelligence object off-request (Mission 10 Phase 2).
  await enqueue("extract_candidate_intelligence", { candidateId: candidate.id }).catch(() => {});

  return { id: candidate.id, name: candidate.fullName, skills: skillRows.length, nameConfidence: cv.nameConfidence, warnings: cv.warnings };
}
