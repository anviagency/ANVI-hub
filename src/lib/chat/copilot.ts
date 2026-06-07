import { prisma } from "@/lib/db";
import { loadJobRow, serializeMatch } from "@/lib/jobs";
import { runMatch, persistAnalyses, toCandidateInput, toJobRequirement, JobRow } from "@/lib/matching/funnel";
import { analyzeCandidate } from "@/lib/matching/scoring";
import { detectAnomalies } from "@/lib/matching/anomaly";
import { scoreAvailability } from "@/lib/matching/availability";
import { applyStage } from "@/lib/pipeline";
import { createShareLink } from "@/lib/share";
import { audit } from "@/lib/auth/audit";
import { extractSkillsFromText, canonicalizeSkill } from "@/lib/ai/skills";
import { similarToCandidate, similarToLastHire, type SimilarResult } from "@/lib/matching/similarity";
import { createClientPackage } from "@/lib/package/build";
import type { Prisma } from "@prisma/client";

// Recruiter Copilot brain (Mission 5.2). Each handler turns intent + message into
// a structured chat response, calling EXISTING backend logic — no new infra.

export interface ChatResult {
  intent: string;
  thinking: string[];
  reply: string;
  kind: string;
  data: Record<string, unknown>;
}

const candidateInclude = { skills: { include: { skill: true } }, employments: true } satisfies Prisma.CandidateDefaultArgs["include"];

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

/** Find candidates whose names are mentioned in free text (capitalized tokens). */
export async function findCandidatesInMessage(message: string, max = 3) {
  // Candidate-name-ish tokens: capitalized words in the original message.
  const tokens = (message.match(/\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b/g) ?? []).filter(
    (w) => !["Compare", "Find", "Show", "Tell", "Who", "Andy", "Lena", "Marco", "Senior", "React", "Python"].includes(w)
  );
  const found = new Map<string, { id: string; fullName: string }>();
  for (const tok of tokens) {
    if (found.size >= max) break;
    const rows = await prisma.candidate.findMany({
      where: { deletedAt: null, fullName: { contains: tok, mode: "insensitive" } },
      select: { id: true, fullName: true },
      take: 2,
    });
    for (const r of rows) found.set(r.id, r);
  }
  return [...found.values()].slice(0, max);
}

export async function resolveCandidatesByNames(names: string[], max = 3) {
  const found = new Map<string, { id: string; fullName: string }>();
  for (const name of names) {
    const clean = name.trim();
    if (!clean) continue;
    const rows = await prisma.candidate.findMany({
      where: { deletedAt: null, fullName: { contains: clean, mode: "insensitive" } },
      select: { id: true, fullName: true },
      take: 2,
    });
    for (const r of rows) found.set(r.id, r);
  }
  return [...found.values()].slice(0, max);
}

/** Resolve a client mentioned in the message (by name or company). */
export async function findClientInMessage(message: string) {
  const clients = await prisma.client.findMany({ select: { id: true, name: true, company: true } });
  const lower = message.toLowerCase();
  return (
    clients.find((c) => {
      const first = c.name.split(/\s+/)[0].toLowerCase();
      return lower.includes(c.name.toLowerCase()) || (c.company && lower.includes(c.company.toLowerCase())) || lower.includes(first);
    }) ?? null
  );
}

/** Pick the job to act on: explicit context → client's open job → most recent open. */
export async function resolveJob(message: string, jobId?: string): Promise<JobRow | null> {
  if (jobId) {
    const j = await loadJobRow(jobId);
    if (j) return j;
  }
  const client = await findClientInMessage(message);
  if (client) {
    const j = await prisma.job.findFirst({ where: { clientId: client.id, status: "open", deletedAt: null }, orderBy: { createdAt: "desc" } });
    if (j) return loadJobRow(j.id);
  }
  const recent = await prisma.job.findFirst({ where: { status: "open", deletedAt: null }, orderBy: { createdAt: "desc" } });
  return recent ? loadJobRow(recent.id) : null;
}

/** Top N analyzed candidates for a job (runs the funnel and caches). */
export async function getTopForJob(job: JobRow, n: number) {
  const results = await runMatch(job, { limit: n });
  await persistAnalyses(job.id, results).catch(() => {});
  return results;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const noJob = (intent: string): ChatResult => ({
  intent, thinking: [], kind: "fallback", data: {},
  reply: "I don't have an open role in focus. Paste a job (or open one) and I'll act on it.",
});

export async function handleExplain(message: string, jobId?: string): Promise<ChatResult> {
  const job = await resolveJob(message, jobId);
  if (!job) return noJob("explain");
  const results = await getTopForJob(job, 3);
  const list = results.map((r) => ({
    id: r.candidate.id,
    name: r.candidate.fullName,
    matchScore: r.matchScore,
    recommendation: r.recommendation,
    reasons: r.scoreBreakdown.filter((b) => b.points > 0).sort((a, b) => b.points - a.points).slice(0, 4).map((b) => `${b.label} (+${b.points})${b.detail ? ` — ${b.detail}` : ""}`),
    strengths: r.strengths.slice(0, 3).map((s) => s.text),
    risks: r.risks.slice(0, 2).map((s) => s.text),
    anomalies: r.anomalies.map((a) => a.text),
  }));
  return {
    intent: "explain", thinking: ["Reading the top matches…", "Decomposing each score…"],
    reply: `Here's why the top ${list.length} ranked highest for ${job.title}.`,
    kind: "explain", data: { jobTitle: job.title, jobId: job.id, list },
  };
}

export async function handleAvailability(message: string, jobId?: string): Promise<ChatResult> {
  let rows = await findCandidatesInMessage(message);
  let scope = "the named candidate(s)";
  if (rows.length === 0) {
    const job = await resolveJob(message, jobId);
    if (!job) return noJob("availability");
    const top = await getTopForJob(job, 5);
    rows = top.map((t) => ({ id: t.candidate.id, fullName: t.candidate.fullName }));
    scope = `the top matches for ${job.title}`;
  }
  const list = [];
  for (const r of rows) {
    const c = await prisma.candidate.findUnique({ where: { id: r.id } });
    if (!c) continue;
    const a = scoreAvailability({ availability: c.availability, availabilityConfirmedAt: c.availabilityConfirmedAt, lastContactedAt: c.lastContactedAt, lastScreenedAt: c.lastScreenedAt, updatedAt: c.updatedAt });
    list.push({ id: c.id, name: c.fullName, score: a.score, band: a.band, availability: c.availability, lastConfirmed: c.availabilityConfirmedAt, reasons: a.reasons });
  }
  return {
    intent: "availability", thinking: ["Scoring availability confidence…"],
    reply: `Availability confidence for ${scope}.`,
    kind: "availability", data: { list },
  };
}

export async function handleSummarize(message: string, jobId?: string): Promise<ChatResult> {
  const named = await findCandidatesInMessage(message, 1);
  if (named.length === 0) return { intent: "summarize", thinking: [], kind: "fallback", data: {}, reply: "Which candidate should I summarize? Name them, e.g. “summarize <name>”." };
  const row = await prisma.candidate.findUnique({ where: { id: named[0].id }, include: candidateInclude });
  if (!row) return noJob("summarize");
  const job = await resolveJob(message, jobId);
  const input = toCandidateInput(row);
  const currentYear = new Date().getUTCFullYear();
  const anomalies = detectAnomalies(input, { currentYear });
  const analysis = job ? analyzeCandidate({ candidate: input, job: toJobRequirement(job), anomalies, currentYear }) : null;
  return {
    intent: "summarize", thinking: ["Pulling the candidate's data room…"],
    reply: `Summary of ${row.fullName}.`,
    kind: "summary",
    data: {
      candidate: {
        id: row.id, name: row.fullName, title: row.title, country: row.country, english: row.englishLevel,
        clientRate: row.clientRate, availability: row.availability, source: row.source,
        summary: row.aiSummary, skills: input.skills.map((s) => s.name),
        matchScore: analysis?.matchScore ?? null, recommendation: analysis?.recommendation ?? null,
        strengths: (analysis?.strengths ?? []).map((s) => s.text), risks: (analysis?.risks ?? []).map((s) => s.text),
        anomalies: anomalies.map((a) => a.text),
        jobTitle: job?.title ?? null,
      },
    },
  };
}

export async function handleCompare(message: string, names: string[], jobId?: string): Promise<ChatResult> {
  let rows = names.length ? await resolveCandidatesByNames(names, 2) : await findCandidatesInMessage(message, 2);
  if (rows.length < 2) return { intent: "compare", thinking: [], kind: "fallback", data: {}, reply: "Name two candidates to compare, e.g. “compare <name> and <name>”." };
  rows = rows.slice(0, 2);
  const job = await resolveJob(message, jobId);
  const currentYear = new Date().getUTCFullYear();
  const cards = [];
  for (const r of rows) {
    const row = await prisma.candidate.findUnique({ where: { id: r.id }, include: candidateInclude });
    if (!row) continue;
    const input = toCandidateInput(row);
    const anomalies = detectAnomalies(input, { currentYear });
    const a = job ? analyzeCandidate({ candidate: input, job: toJobRequirement(job), anomalies, currentYear }) : null;
    const avail = scoreAvailability({ availability: row.availability, availabilityConfirmedAt: row.availabilityConfirmedAt, lastContactedAt: row.lastContactedAt, lastScreenedAt: row.lastScreenedAt, updatedAt: row.updatedAt });
    cards.push({
      id: row.id, name: row.fullName, country: row.country, english: row.englishLevel, clientRate: row.clientRate,
      matchScore: a?.matchScore ?? 0, recommendation: a?.recommendation ?? "—",
      strengths: (a?.strengths ?? []).slice(0, 3).map((s) => s.text), risks: (a?.risks ?? []).slice(0, 2).map((s) => s.text),
      anomalies: anomalies.length, availabilityScore: avail.score,
    });
  }
  // Recommendation: higher score, tie-broken by availability then rate.
  const [x, y] = cards;
  const winner = x.matchScore !== y.matchScore ? (x.matchScore > y.matchScore ? x : y)
    : x.availabilityScore !== y.availabilityScore ? (x.availabilityScore > y.availabilityScore ? x : y)
    : ((x.clientRate ?? 1e9) <= (y.clientRate ?? 1e9) ? x : y);
  return {
    intent: "compare", thinking: ["Analyzing both candidates…", "Weighing fit, risk, availability, rate…"],
    reply: `${x.name} vs ${y.name}${job ? ` for ${job.title}` : ""}.`,
    kind: "comparison", data: { jobTitle: job?.title ?? null, cards, recommendation: { id: winner.id, name: winner.name } },
  };
}

export async function handleSubmit(message: string, count: number, userId: string, jobId?: string): Promise<ChatResult> {
  const job = await resolveJob(message, jobId);
  if (!job) return noJob("submit");
  // Prefer explicitly named candidates; else top N matches.
  const named = await findCandidatesInMessage(message);
  let targetIds: { id: string; name: string }[];
  if (named.length) targetIds = named.map((n) => ({ id: n.id, name: n.fullName }));
  else {
    const top = await getTopForJob(job, count);
    targetIds = top.map((t) => ({ id: t.candidate.id, name: t.candidate.fullName }));
  }
  const submitted: { name: string }[] = [];
  for (const t of targetIds) {
    try {
      await applyStage({ candidateId: t.id, jobId: job.id, to: "sent_to_client", actor: "recruiter" });
      submitted.push({ name: t.name });
    } catch { /* invalid transition (already past) — skip */ }
  }
  await audit({ userId, action: "submit_from_chat", entity: "job", entityId: job.id, meta: { count: submitted.length } });
  const clientName = (await prisma.job.findUnique({ where: { id: job.id }, include: { client: true } }))?.client?.company ?? "the client";
  return {
    intent: "submit", thinking: ["Submitting to the client…", "Queuing WhatsApp notifications…"],
    reply: submitted.length ? `Submitted ${submitted.length} candidate${submitted.length === 1 ? "" : "s"} to ${clientName} for ${job.title}. They'll get a WhatsApp now.` : "Nothing to submit — those candidates may already be with the client.",
    kind: "submit_result", data: { jobTitle: job.title, client: clientName, submitted },
  };
}

export async function handleShare(message: string, count: number, userId: string, jobId?: string): Promise<ChatResult> {
  const job = await resolveJob(message, jobId);
  if (!job) return noJob("share");
  const named = await findCandidatesInMessage(message);
  let ids: { id: string; name: string }[];
  if (named.length) ids = named.map((n) => ({ id: n.id, name: n.fullName }));
  else {
    const top = await getTopForJob(job, count);
    ids = top.map((t) => ({ id: t.candidate.id, name: t.candidate.fullName }));
  }
  if (ids.length === 0) return { ...noJob("share"), reply: "No candidates to share yet — run a match first." };
  const link = await createShareLink({ jobId: job.id, label: `Top picks — ${job.title}`, createdById: userId, candidates: ids.map((i) => ({ candidateId: i.id })) });
  await audit({ userId, action: "share_from_chat", entity: "share_link", entityId: link.token, meta: { jobId: job.id, candidates: ids.length } });
  return {
    intent: "share", thinking: ["Building a secure client link…"],
    reply: `Client link ready with ${ids.length} candidate${ids.length === 1 ? "" : "s"} for ${job.title}.`,
    kind: "share_result", data: { url: `/share/${link.token}`, token: link.token, candidates: ids.map((i) => i.name) },
  };
}

/** Extract a "N years" threshold from free text (English + Hebrew). */
function extractMinYears(message: string): number | null {
  const m = message.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?|שנ(?:ים|ות|ה))/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Search the candidate POOL by attributes (skills, min years, country) —
 * independent of any job (spec §6.4 candidate rediscovery / §9.3 free-text
 * search). This is NOT a job match: it answers "find candidates with 7 years
 * Python" directly against the database.
 */
export async function handleSearchCandidates(message: string, entities: Record<string, unknown>): Promise<ChatResult> {
  // Criteria: prefer router-extracted entities (AI handles Hebrew), else derive
  // deterministically from the message.
  const rawSkills = Array.isArray(entities.skills) ? (entities.skills as unknown[]).map(String) : [];
  const skills = (rawSkills.length ? rawSkills : extractSkillsFromText(message))
    .map((s) => canonicalizeSkill(s) ?? s)
    .filter((s, i, arr) => s && arr.indexOf(s) === i);
  const minYears = Number(entities.minYears ?? entities.min_years ?? 0) || extractMinYears(message) || 0;
  const country = (entities.country as string)?.trim() || undefined;

  if (skills.length === 0) {
    return {
      intent: "search_candidates", thinking: [], kind: "fallback", data: {},
      reply: "Which skill should I search for? e.g. “find candidates with 7 years Python”.",
    };
  }

  // Fast filter: candidates holding at least one requested skill (+ optional country).
  const where: Prisma.CandidateWhereInput = {
    deletedAt: null,
    archivedAt: null,
    skills: { some: { skill: { canonicalName: { in: skills, mode: "insensitive" } } } },
  };
  if (country) where.country = { equals: country, mode: "insensitive" };

  const rows = await prisma.candidate.findMany({ where, include: candidateInclude, take: 100 });

  const lc = (s: string) => s.toLowerCase();
  const wanted = skills.map(lc);
  const ranked = rows
    .map((c) => {
      const cs = c.skills.map((s) => ({ name: s.skill.canonicalName, years: s.years }));
      const matched = cs.filter((s) => wanted.includes(lc(s.name)));
      const bestYears = matched.length ? Math.max(...matched.map((s) => s.years)) : 0;
      const totalYears = c.totalYears ?? 0;
      const meetsYears = minYears ? bestYears >= minYears || totalYears >= minYears : true;
      // Relevance: skills covered + years threshold + depth (capped).
      const coverage = matched.length / skills.length;
      const score = Math.round(coverage * 60 + (meetsYears ? 25 : 0) + Math.min(bestYears, 15));
      return { c, cs, matched, bestYears, totalYears, meetsYears, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const list = ranked.map((r) => {
    const input = toCandidateInput(r.c);
    const anomalies = detectAnomalies(input, { currentYear: new Date().getUTCFullYear() });
    const strengths = r.matched.map((m) => ({ text: `${formatYrs(m.years)} ${m.name}`, evidence: "" }));
    const risks = minYears && !r.meetsYears ? [{ text: `Below requested ${minYears}+ years (${formatYrs(r.bestYears)} on ${skills[0]})`, severity: "low" }] : [];
    return {
      id: r.c.id, name: r.c.fullName, title: r.c.title, country: r.c.country, location: r.c.location, flag: r.c.flag,
      english: r.c.englishLevel, availability: r.c.availability, availabilityNote: r.c.availabilityNote,
      clientRate: r.c.clientRate, skills: r.cs.map((s) => s.name).slice(0, 8),
      matchScore: r.score, recommendation: r.score >= 80 ? "strong" : r.score >= 55 ? "possible" : "weak",
      strengths, risks, anomalies: anomalies.map((a) => ({ text: a.text, severity: a.severity })),
    };
  });

  const criteria = [skills.join(", "), minYears ? `${minYears}+ years` : null, country].filter(Boolean).join(" · ");
  const metCount = ranked.filter((r) => r.meetsYears && r.matched.length === skills.length).length;
  const reply = list.length
    ? `Found ${list.length} candidate${list.length === 1 ? "" : "s"} matching ${criteria}${minYears ? ` — ${metCount} meet the ${minYears}+ years bar.` : "."}`
    : `No candidates in the database match ${criteria}. Try importing CVs, or broaden the criteria.`;

  return {
    intent: "search_candidates",
    thinking: [`Searching the talent pool for ${criteria}…`, "Ranking by skill coverage, years & depth…"],
    reply,
    kind: list.length ? "candidates" : "fallback",
    data: { list, search: { skills, minYears, country } },
  };
}

function formatYrs(y: number): string {
  return Number.isInteger(y) ? `${y}y` : `${y.toFixed(1)}y`;
}

/**
 * Match the talent pool against a JOB in focus (explicit jobId or most-recent open).
 * Extracted from the chat route so it can be reused as an agent tool.
 */
export async function handleMatchForJob(message: string, jobId?: string, entities: Record<string, unknown> = {}): Promise<ChatResult> {
  let job = jobId ? await loadJobRow(jobId) : null;
  if (!job) {
    const recent = await prisma.job.findFirst({ where: { status: "open", deletedAt: null }, orderBy: { createdAt: "desc" } });
    if (recent) job = await loadJobRow(recent.id);
  }
  if (!job) {
    return { intent: "match_candidates", thinking: [], kind: "fallback", data: {}, reply: "I don't have an open role yet. Paste a job description and I'll structure it first." };
  }
  const cheaper = entities.cheaper === true || /\b(cheaper|under budget|lower)\b/i.test(message);
  const results = await runMatch(job, { limit: 6 });
  let serialized = results.map(serializeMatch);
  if (cheaper && job.budgetMax) {
    const mid = job.budgetMax * 0.85;
    serialized = serialized.filter((c) => (c.clientRate ?? Infinity) <= mid);
  }
  await persistAnalyses(job.id, results).catch((e) => console.error("persistAnalyses", e));
  const flagged = serialized.filter((c) => c.anomalies.length > 0).length;
  return {
    intent: "match_candidates",
    thinking: ["Stage 1 · filtering the talent pool…", "Stage 2 · analysis + anomaly checks…", "Ranking…"],
    reply: `Here ${serialized.length === 1 ? "is" : "are"} the ${serialized.length} strongest match${serialized.length === 1 ? "" : "es"} for ${job.title}${cheaper ? ", filtered to your budget" : ""}.${flagged > 0 ? ` ⚠️ ${flagged} ${flagged === 1 ? "has" : "have"} a red anomaly worth a look.` : ""}`,
    kind: "candidates",
    data: { jobId: job.id, jobTitle: job.title, list: serialized },
  };
}

/** "Who is the safest candidate?" — rank finalists by fewest anomalies, then
 * availability confidence, then fit. A recruiter-judgment composition. */
export async function handleSafest(message: string, jobId?: string): Promise<ChatResult> {
  const job = await resolveJob(message, jobId);
  if (!job) return noJob("safest");
  const results = await runMatch(job, { limit: 8 });
  await persistAnalyses(job.id, results).catch(() => {});
  const ranked = [...results].sort(
    (a, b) =>
      a.anomalies.length - b.anomalies.length ||
      b.availability.score - a.availability.score ||
      b.matchScore - a.matchScore
  );
  const list = ranked.map((r) => serializeMatch(r));
  const top = ranked[0];
  const reply = top
    ? `Safest pick: ${top.candidate.fullName} — ${top.anomalies.length === 0 ? "no anomaly flags" : `${top.anomalies.length} flag(s)`}, availability ${top.availability.score}%, match ${top.matchScore}.`
    : "No candidates to assess yet — run a match first.";
  return { intent: "safest", thinking: ["Weighing anomalies, availability & fit…"], reply, kind: list.length ? "candidates" : "fallback", data: { jobId: job.id, jobTitle: job.title, list } };
}

/** "Build a shortlist" — the top N for the job in focus, ready to share/submit. */
export async function handleShortlist(message: string, count: number, jobId?: string): Promise<ChatResult> {
  const job = await resolveJob(message, jobId);
  if (!job) return noJob("shortlist");
  const results = await runMatch(job, { limit: Math.min(count || 5, 10) });
  await persistAnalyses(job.id, results).catch(() => {});
  const list = results.map((r) => serializeMatch(r));
  return {
    intent: "shortlist",
    thinking: ["Assembling the strongest shortlist…"],
    reply: list.length ? `Here's a shortlist of ${list.length} for ${job.title}. I can share these with the client or generate a package.` : "No candidates yet — run a match first.",
    kind: list.length ? "candidates" : "fallback",
    data: { jobId: job.id, jobTitle: job.title, list },
  };
}

/**
 * "Find candidates similar to X" — a FIRST-CLASS candidate-similarity capability
 * (Mission 10 Phase 5). Never silently matches a job. Supports modifiers:
 * cheaper, stronger English, and "similar to the last successful hire".
 */
export async function handleSimilar(message: string, jobId?: string): Promise<ChatResult> {
  void jobId;
  const cheaper = /\b(cheaper|lower(\s+rate)?|less expensive|under budget)\b/i.test(message);
  const strongerEnglish = /\b(stronger|better|higher|more)\b[^.]*\benglish\b/i.test(message) || /\benglish\b[^.]*\b(stronger|better|higher)\b/i.test(message);
  const lastHire = /\b(last|recent|previous|successful)\b[^.]*\b(hire|placement|placed|candidate)\b/i.test(message);

  let result: SimilarResult;
  let refLabel = "that candidate";
  if (lastHire) {
    const client = await findClientInMessage(message);
    const clientId = client?.id ?? (await prisma.placement.findFirst({ orderBy: { createdAt: "desc" }, select: { clientId: true } }))?.clientId;
    if (!clientId) return { intent: "find_similar", thinking: [], kind: "fallback", data: {}, reply: "There are no placements yet to compare against." };
    result = await similarToLastHire(clientId, { limit: 8, cheaperThanRef: cheaper, strongerEnglish });
    refLabel = result.reference ? `${result.reference.name} (last successful hire)` : "the last successful hire";
    if (!result.reference) return { intent: "find_similar", thinking: [], kind: "fallback", data: {}, reply: "No successful hire found for that client yet." };
  } else {
    const named = await findCandidatesInMessage(message, 1);
    if (named.length === 0) return { intent: "find_similar", thinking: [], kind: "fallback", data: {}, reply: "Who should I find similar candidates to? Name them, e.g. “find candidates similar to Vasya”." };
    result = await similarToCandidate(named[0].id, { limit: 8, cheaperThanRef: cheaper, strongerEnglish, excludePlaced: true });
    refLabel = result.reference?.name ?? named[0].fullName;
  }

  const list = result.candidates.map((c) => ({
    id: c.id, name: c.name, title: null, country: c.country, location: null, flag: null,
    english: c.englishLevel, availability: "available", availabilityNote: null, clientRate: c.clientRate,
    skills: c.skills.slice(0, 8), matchScore: c.similarity,
    recommendation: c.similarity >= 70 ? "strong" : c.similarity >= 45 ? "possible" : "weak",
    strengths: [{ text: `${c.similarity}% similar`, evidence: "skills + experience + location" }], risks: [], anomalies: [],
  }));
  const mods = [cheaper ? "cheaper" : null, strongerEnglish ? "stronger English" : null].filter(Boolean).join(" · ");
  return {
    intent: "find_similar",
    thinking: ["Comparing skills, experience & profile…"],
    reply: list.length ? `Candidates similar to ${refLabel}${mods ? ` — ${mods}` : ""}: ${list.length} found.` : `No similar candidates${mods ? ` (${mods})` : ""} found for ${refLabel}.`,
    kind: list.length ? "candidates" : "fallback",
    data: { list, reference: result.reference },
  };
}

/**
 * "Create a client package" (Mission 10 Phase 6) — composes an anonymized,
 * branded, shareable candidate package for the role in focus. Uses named
 * candidates, else those already submitted, else the top matches.
 */
export async function handleClientPackage(message: string, userId: string, jobId?: string): Promise<ChatResult> {
  const job = await resolveJob(message, jobId);
  if (!job) return noJob("client_package");

  const named = await findCandidatesInMessage(message);
  let ids: string[];
  if (named.length) {
    ids = named.map((n) => n.id);
  } else {
    const subs = await prisma.submission.findMany({ where: { jobId: job.id }, orderBy: { submittedAt: "desc" }, take: 6 });
    if (subs.length) ids = subs.map((s) => s.candidateId);
    else {
      const top = await getTopForJob(job, 4);
      ids = top.map((t) => t.candidate.id);
    }
  }

  const pkg = await createClientPackage({ jobId: job.id, candidateIds: ids, createdBy: userId });
  if (!pkg) return { intent: "client_package", thinking: [], kind: "fallback", data: {}, reply: "I couldn't find candidates to package yet — run a match or submit some first." };
  await audit({ userId, action: "client_package_created", entity: "client_package", entityId: pkg.token, meta: { jobId: job.id, count: pkg.count } });
  return {
    intent: "client_package",
    thinking: ["Composing the client package…", "Anonymizing contact details…", "Applying branding…"],
    reply: `Client package ready with ${pkg.count} candidate${pkg.count === 1 ? "" : "s"} for ${job.title}. It's anonymized (no contact details) and branded — share this link with the client.`,
    kind: "share_result",
    data: { url: pkg.url, token: pkg.token, candidates: pkg.count },
  };
}

export async function handlePending(): Promise<ChatResult> {
  const items: { type: string; label: string; candidateId?: string; jobId?: string; action: string }[] = [];

  // Candidates awaiting recruiter steps.
  const pipelines = await prisma.pipeline.findMany({
    where: { candidate: { deletedAt: null } },
    include: { candidate: { select: { fullName: true, lastContactedAt: true } }, job: { select: { title: true, client: { select: { company: true } } } } },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
  for (const p of pipelines) {
    if (p.stage === "new") items.push({ type: "screen", label: `Screen ${p.candidate.fullName} (${p.job.title})`, candidateId: p.candidateId, jobId: p.jobId, action: "schedule_screening" });
    else if (p.stage === "screened") items.push({ type: "submit", label: `Submit ${p.candidate.fullName} to ${p.job.client?.company ?? "client"} (${p.job.title})`, candidateId: p.candidateId, jobId: p.jobId, action: "submit" });
    else if (p.stage === "interview") items.push({ type: "interview", label: `${p.candidate.fullName} — client requested interview (${p.job.title})`, candidateId: p.candidateId, jobId: p.jobId, action: "schedule_interview" });
  }

  // Stale contact: candidates in pipeline not contacted in 7+ days.
  const stale = pipelines.filter((p) => {
    const lc = p.candidate.lastContactedAt;
    return !lc || Date.now() - lc.getTime() > 7 * 86400000;
  }).slice(0, 5);
  for (const p of stale) items.push({ type: "followup", label: `Follow up with ${p.candidate.fullName} — no recent contact`, candidateId: p.candidateId, action: "contact" });

  // Jobs with no analysis yet.
  const jobs = await prisma.job.findMany({ where: { status: "open", deletedAt: null }, include: { _count: { select: { analyses: true } } } });
  for (const j of jobs) if (j._count.analyses === 0) items.push({ type: "match", label: `Run matching for ${j.title}`, jobId: j.id, action: "match" });

  // De-dup labels, cap.
  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true))).slice(0, 12);
  return {
    intent: "followup", thinking: ["Scanning the pipeline for open actions…"],
    reply: unique.length ? `You have ${unique.length} open action${unique.length === 1 ? "" : "s"}.` : "You're all caught up — no pending actions.",
    kind: "pending", data: { items: unique },
  };
}
