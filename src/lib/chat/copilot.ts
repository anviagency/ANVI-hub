import { prisma } from "@/lib/db";
import { loadJobRow } from "@/lib/jobs";
import { runMatch, persistAnalyses, toCandidateInput, toJobRequirement, JobRow } from "@/lib/matching/funnel";
import { analyzeCandidate } from "@/lib/matching/scoring";
import { detectAnomalies } from "@/lib/matching/anomaly";
import { scoreAvailability } from "@/lib/matching/availability";
import { applyStage } from "@/lib/pipeline";
import { createShareLink } from "@/lib/share";
import { audit } from "@/lib/auth/audit";
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
  if (named.length === 0) return { intent: "summarize", thinking: [], kind: "fallback", data: {}, reply: "Which candidate should I summarize? Name them, e.g. “summarize Artem”." };
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
  if (rows.length < 2) return { intent: "compare", thinking: [], kind: "fallback", data: {}, reply: "Name two candidates to compare, e.g. “compare Artem and Oleksandr”." };
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
