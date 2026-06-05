import { prisma } from "@/lib/db";
import { canonicalizeSkill } from "@/lib/ai/skills";
import type { ImportFieldKey } from "@/lib/import/parse";
import type { Availability, Prisma } from "@prisma/client";

// Candidate ingestion (mission item 1): map → dedupe → create/update.
// The pure helpers below are unit-tested without a DB; ingestRows does the I/O.

export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

export interface NormalizedCandidate {
  fullName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  country: string | null;
  location: string | null;
  englishLevel: string | null;
  totalYears: number | null;
  clientRate: number | null;
  salaryExpectation: number | null;
  availability: Availability;
  skills: string[]; // canonical names
  linkedinUrl: string | null;
  source: string | null;
}

function pick(row: Record<string, string>, mapping: ColumnMapping, key: ImportFieldKey): string {
  const col = mapping[key];
  if (!col) return "";
  return (row[col] ?? "").trim();
}

function toNumber(v: string): number | null {
  if (!v) return null;
  const m = v.replace(/[^0-9.]/g, "");
  if (!m) return null;
  const n = parseFloat(m);
  return Number.isFinite(n) ? n : null;
}

export function normalizeAvailability(v: string): Availability {
  const s = v.toLowerCase().trim();
  if (!s) return "available";
  if (/(placed|hired|busy|engaged)/.test(s)) return "placed";
  if (/(hold|on hold|paused|unavailable|not available)/.test(s)) return "on_hold";
  return "available";
}

export function parseSkills(v: string): string[] {
  if (!v) return [];
  const out = new Set<string>();
  for (const tok of v.split(/[,;|/]+/)) {
    const t = tok.trim();
    if (!t) continue;
    out.add(canonicalizeSkill(t) ?? t);
  }
  return [...out];
}

/**
 * Dedupe identity. Email (lowercased) is authoritative; otherwise name+country.
 * Returns null when there isn't even a name (the row is unusable).
 */
/** Derive a career-start year from total years of experience (P2 fallback). */
export function deriveCareerStartYear(totalYears: number | null | undefined, now: Date = new Date()): number | null {
  if (totalYears == null || totalYears <= 0) return null;
  return now.getUTCFullYear() - Math.round(totalYears);
}

export function dedupeKeyFor(c: { email?: string | null; fullName?: string | null; country?: string | null }): string | null {
  const email = (c.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = (c.fullName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!name) return null;
  const country = (c.country ?? "").trim().toLowerCase();
  return `name:${name}|${country}`;
}

export function mapRow(row: Record<string, string>, mapping: ColumnMapping): NormalizedCandidate | null {
  const fullName = pick(row, mapping, "fullName");
  if (!fullName) return null; // unusable
  return {
    fullName,
    email: pick(row, mapping, "email") || null,
    phone: pick(row, mapping, "phone") || null,
    title: pick(row, mapping, "title") || null,
    country: pick(row, mapping, "country") || null,
    location: pick(row, mapping, "location") || null,
    englishLevel: pick(row, mapping, "englishLevel") || null,
    totalYears: toNumber(pick(row, mapping, "totalYears")),
    clientRate: toNumber(pick(row, mapping, "clientRate")),
    salaryExpectation: toNumber(pick(row, mapping, "salaryExpectation")),
    availability: normalizeAvailability(pick(row, mapping, "availability")),
    skills: parseSkills(pick(row, mapping, "skills")),
    linkedinUrl: pick(row, mapping, "linkedinUrl") || null,
    source: pick(row, mapping, "source") || null,
  };
}

export interface IngestSummary {
  batchId: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  rows: { fullName: string; action: "created" | "updated" | "skipped"; reason?: string }[];
}

/** Resolve canonical skill names to skill ids, creating any that are missing. */
async function ensureSkillIds(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const name of names) {
    if (map.has(name)) continue;
    const skill = await prisma.skill.upsert({
      where: { canonicalName: name },
      create: { canonicalName: name, synonyms: [] },
      update: {},
    });
    map.set(name, skill.id);
  }
  return map;
}

export async function ingestRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  opts: { filename?: string; source?: string } = {}
): Promise<IngestSummary> {
  const batch = await prisma.importBatch.create({
    data: { filename: opts.filename ?? null, source: opts.source ?? null, total: rows.length },
  });

  const summary: IngestSummary = {
    batchId: batch.id,
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    rows: [],
  };

  const seenInFile = new Set<string>();

  for (const raw of rows) {
    const norm = mapRow(raw, mapping);
    if (!norm) {
      summary.skipped++;
      summary.rows.push({ fullName: "(no name)", action: "skipped", reason: "missing name" });
      continue;
    }
    const key = dedupeKeyFor(norm);
    if (!key) {
      summary.skipped++;
      summary.rows.push({ fullName: norm.fullName, action: "skipped", reason: "no dedupe key" });
      continue;
    }

    const allSkillIds = await ensureSkillIds(norm.skills);
    // Imports rarely carry per-skill years. Default to the candidate's total
    // experience instead of 0 — 0 fails every min-years filter and silently
    // makes imported candidates unmatchable (Mission 5 review finding).
    const defaultSkillYears = norm.totalYears && norm.totalYears > 0 ? Math.round(norm.totalYears) : 2;
    const skillCreate = norm.skills.map((n) => ({ skillId: allSkillIds.get(n)!, years: defaultSkillYears }));

    const existing = await prisma.candidate.findUnique({ where: { dedupeKey: key } });

    if (existing) {
      await prisma.candidate.update({
        where: { id: existing.id },
        data: {
          // Only overwrite with non-empty incoming values (don't wipe good data).
          fullName: norm.fullName,
          email: norm.email ?? existing.email,
          phone: norm.phone ?? existing.phone,
          title: norm.title ?? existing.title,
          country: norm.country ?? existing.country,
          location: norm.location ?? existing.location,
          englishLevel: norm.englishLevel ?? existing.englishLevel,
          totalYears: norm.totalYears ?? existing.totalYears,
          clientRate: norm.clientRate ?? existing.clientRate,
          salaryExpectation: norm.salaryExpectation ?? existing.salaryExpectation,
          availability: norm.availability,
          linkedinUrl: norm.linkedinUrl ?? existing.linkedinUrl,
          source: norm.source ?? existing.source,
          // Derive careerStartYear from years-of-experience so tenure anomaly
          // rules fire on imported candidates (Mission 3.5 P2).
          careerStartYear: existing.careerStartYear ?? deriveCareerStartYear(norm.totalYears ?? existing.totalYears),
          importBatchId: batch.id,
          // updatedAt is bumped automatically (@updatedAt) — "track last updated date".
          skills: {
            upsert: skillCreate.map((s) => ({
              where: { candidateId_skillId: { candidateId: existing.id, skillId: s.skillId } },
              create: { skillId: s.skillId, years: s.years },
              update: {},
            })),
          },
        },
      });
      await prisma.candidateEvent.create({
        data: { candidateId: existing.id, type: "imported", actor: "system", meta: { batchId: batch.id, action: "updated" } as Prisma.InputJsonValue },
      });
      summary.updated++;
      summary.rows.push({ fullName: norm.fullName, action: "updated" });
      seenInFile.add(key);
    } else if (seenInFile.has(key)) {
      // Duplicate within the same file after the first was created — treat as update no-op.
      summary.skipped++;
      summary.rows.push({ fullName: norm.fullName, action: "skipped", reason: "duplicate in file" });
    } else {
      const created = await prisma.candidate.create({
        data: {
          fullName: norm.fullName,
          email: norm.email,
          phone: norm.phone,
          title: norm.title,
          country: norm.country,
          location: norm.location,
          englishLevel: norm.englishLevel,
          totalYears: norm.totalYears,
          clientRate: norm.clientRate,
          salaryExpectation: norm.salaryExpectation,
          availability: norm.availability,
          linkedinUrl: norm.linkedinUrl,
          source: norm.source ?? opts.source ?? "import",
          careerStartYear: deriveCareerStartYear(norm.totalYears),
          dedupeKey: key,
          importBatchId: batch.id,
          skills: { create: skillCreate },
        },
      });
      await prisma.candidateEvent.create({
        data: { candidateId: created.id, type: "imported", actor: "system", meta: { batchId: batch.id, action: "created" } as Prisma.InputJsonValue },
      });
      summary.created++;
      summary.rows.push({ fullName: norm.fullName, action: "created" });
      seenInFile.add(key);
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { created: summary.created, updated: summary.updated, skipped: summary.skipped },
  });

  return summary;
}
