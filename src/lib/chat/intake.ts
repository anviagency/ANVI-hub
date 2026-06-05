import { prisma } from "@/lib/db";
import { ParsedJob } from "@/lib/types";
import { parseJob } from "@/lib/ai/job-parser";
import { canonicalizeSkill } from "@/lib/ai/skills";
import { audit } from "@/lib/auth/audit";
import type { ChatResult } from "@/lib/chat/copilot";

// Conversational job creation (Mission 7.1 Part 1). A slot-filling state machine
// carried across chat turns via `context.pendingJob`. The AI asks for ONE missing
// field at a time, resolves the client with buttons, then creates the job and
// hands the recruiter their Job Workspace. No forms, no command syntax.

export interface JobIntake {
  parsed: ParsedJob;
  workMode?: string | null;
  employmentType?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  asked: string[];
  asking: string | null; // field currently awaiting an answer
  stage: "gathering" | "confirm_client" | "create_client" | "ready";
}

interface Field {
  key: string;
  missing: (i: JobIntake) => boolean;
  question: (i: JobIntake) => string;
  buttons?: { label: string; value: string }[];
  apply: (i: JobIntake, answer: string) => void;
}

const FIELDS: Field[] = [
  {
    key: "budget",
    missing: (i) => i.parsed.budget.min == null,
    question: () => "What's the target budget? (e.g. $30–45/hr)",
    apply: (i, a) => {
      const range = a.match(/\$?\s*(\d{1,3})\s*[-–—to]+\s*\$?\s*(\d{1,3})/);
      const one = a.match(/\$?\s*(\d{1,3})/);
      const monthly = /month|\/mo|monthly|k\b/i.test(a);
      if (range) i.parsed.budget = { min: +range[1], max: +range[2], unit: monthly ? "usd_month" : "usd_hour" };
      else if (one) i.parsed.budget = { min: +one[1], max: +one[1], unit: monthly ? "usd_month" : "usd_hour" };
    },
  },
  {
    key: "workMode",
    missing: (i) => !i.workMode,
    question: () => "Is this remote, hybrid, or onsite?",
    buttons: [{ label: "Remote", value: "remote" }, { label: "Hybrid", value: "hybrid" }, { label: "Onsite", value: "onsite" }],
    apply: (i, a) => {
      const t = a.toLowerCase();
      i.workMode = /hybrid/.test(t) ? "hybrid" : /onsite|on-site|office/.test(t) ? "onsite" : "remote";
    },
  },
  {
    key: "employmentType",
    missing: (i) => !i.employmentType,
    question: () => "Full-time, part-time, or contract?",
    buttons: [{ label: "Full-time", value: "full_time" }, { label: "Part-time", value: "part_time" }, { label: "Contract", value: "contract" }],
    apply: (i, a) => {
      const t = a.toLowerCase();
      i.employmentType = /part/.test(t) ? "part_time" : /contract|freelance/.test(t) ? "contract" : "full_time";
    },
  },
  {
    key: "seniority",
    missing: (i) => !i.parsed.seniority,
    question: () => "What seniority level — junior, mid, or senior?",
    buttons: [{ label: "Junior", value: "Junior" }, { label: "Mid", value: "Middle" }, { label: "Senior", value: "Senior" }],
    apply: (i, a) => {
      const t = a.toLowerCase();
      i.parsed.seniority = /senior|lead|principal/.test(t) ? "Senior" : /junior|entry/.test(t) ? "Junior" : "Middle";
    },
  },
  {
    key: "english",
    missing: (i) => !i.parsed.englishLevel,
    question: () => "What English level is required? (e.g. B2, C1, fluent)",
    apply: (i, a) => {
      const t = a.toLowerCase();
      i.parsed.englishLevel = /native|fluent|c2/.test(t) ? "Fluent" : /c1/.test(t) ? "C1" : /b2/.test(t) ? "B2+" : a.trim() || "B2+";
    },
  },
];

function nextMissing(i: JobIntake): Field | null {
  return FIELDS.find((f) => f.missing(i) && !i.asked.includes(f.key)) ?? null;
}

function askField(i: JobIntake, f: Field): ChatResult {
  i.asking = f.key;
  i.asked.push(f.key);
  return {
    intent: "create_job",
    thinking: [],
    reply: f.question(i),
    kind: "job_intake",
    data: { pendingJob: i, field: f.key, buttons: f.buttons ?? null },
  };
}

async function resolveClientStep(i: JobIntake, name: string): Promise<ChatResult> {
  i.clientName = name.trim();
  const all = await prisma.client.findMany({ select: { id: true, name: true, company: true } });
  const lower = name.trim().toLowerCase();
  const match = all.find((c) => {
    const n = c.name.toLowerCase();
    const co = (c.company ?? "").toLowerCase();
    return n === lower || co === lower || n.startsWith(lower) || n.split(/\s+/).includes(lower) || (co && co.includes(lower));
  });
  if (match) {
    i.clientId = match.id;
    i.stage = "confirm_client";
    return {
      intent: "create_job", thinking: [], kind: "job_intake",
      reply: `Found existing client ${match.company ?? match.name}. Attach this position to them?`,
      data: { pendingJob: i, field: "confirm_client", buttons: [{ label: "Yes", value: "yes" }, { label: "Different client", value: "__different__" }] },
    };
  }
  i.stage = "create_client";
  return {
    intent: "create_job", thinking: [], kind: "job_intake",
    reply: `I couldn't find a client named "${name.trim()}". Create it as a new client?`,
    data: { pendingJob: i, field: "create_client", buttons: [{ label: "Create client", value: "__create__" }, { label: "Search again", value: "__search__" }] },
  };
}

async function finalize(i: JobIntake, userId: string): Promise<ChatResult> {
  const p = i.parsed;
  const skillRows = [];
  for (const s of p.skills) {
    const canonical = canonicalizeSkill(s.name) ?? s.name;
    const skill = await prisma.skill.upsert({ where: { canonicalName: canonical }, create: { canonicalName: canonical, synonyms: [] }, update: {} });
    skillRows.push({ skillId: skill.id, required: s.required, minYears: s.minYears });
  }
  const job = await prisma.job.create({
    data: {
      clientId: i.clientId ?? null, title: p.title ?? "Untitled role", seniority: p.seniority,
      experienceYearsMin: p.experienceYearsMin, englishLevel: p.englishLevel,
      budgetMin: p.budget.min, budgetMax: p.budget.max, budgetUnit: p.budget.unit,
      workMode: i.workMode ?? null, employmentType: i.employmentType ?? null,
      descriptionRaw: null, skills: { create: skillRows },
    },
    include: { client: true },
  });
  await audit({ userId, action: "job_created_conversational", entity: "job", entityId: job.id, meta: { title: job.title } });
  return {
    intent: "create_job", thinking: ["Creating the position…", "Setting up the workspace…"],
    reply: `Done — ${job.title}${job.client ? ` for ${job.client.company ?? job.client.name}` : ""} is live. I've opened its workspace; say “match” and I'll start sourcing candidates.`,
    kind: "job_created",
    data: { jobId: job.id, jobTitle: job.title, client: job.client?.company ?? null, workspaceUrl: `/jobs/${job.id}` },
  };
}

/** One turn of the conversational intake. */
export async function runIntake(message: string, prior: JobIntake | null, userId: string): Promise<ChatResult> {
  // Fresh start — parse the role from the paste.
  if (!prior) {
    const parsed = await parseJob(message);
    if (!parsed.isJob) {
      return { intent: "create_job", thinking: [], kind: "fallback", data: {}, reply: "Tell me the role and I'll structure it — title, key skills, and anything you know (budget, client, level)." };
    }
    const intake: JobIntake = { parsed, workMode: null, employmentType: null, asked: [], asking: null, stage: "gathering" };
    const f = nextMissing(intake);
    if (f) return askField(intake, f);
    intake.asking = "client";
    intake.asked.push("client");
    return { intent: "create_job", thinking: [], kind: "job_intake", reply: "Which client is this for?", data: { pendingJob: intake, field: "client", buttons: null } };
  }

  const i = prior;
  const ans = message.trim();

  // Client confirmation / creation branches.
  if (i.stage === "confirm_client") {
    if (/^(yes|yep|attach|correct|sure|ok)/i.test(ans) && ans !== "__different__") return finalize(i, userId);
    // different client → re-ask
    i.stage = "gathering"; i.clientId = null; i.asking = "client";
    return { intent: "create_job", thinking: [], kind: "job_intake", reply: "No problem — which client should it be?", data: { pendingJob: i, field: "client", buttons: null } };
  }
  if (i.stage === "create_client") {
    if (ans === "__create__" || /^(yes|create)/i.test(ans)) {
      const created = await prisma.client.create({ data: { name: i.clientName ?? "New client", company: i.clientName ?? null, portalSlug: slug(i.clientName ?? "client") } });
      i.clientId = created.id; i.stage = "ready";
      return finalize(i, userId);
    }
    // search again
    i.stage = "gathering"; i.asking = "client";
    return { intent: "create_job", thinking: [], kind: "job_intake", reply: "Sure — what's the client name?", data: { pendingJob: i, field: "client", buttons: null } };
  }

  // We're answering the field we last asked.
  if (i.asking === "client") {
    return resolveClientStep(i, ans);
  }
  const answered = FIELDS.find((f) => f.key === i.asking);
  if (answered) answered.apply(i, ans);
  i.asking = null;

  // Ask the next missing field, else move to client, else finalize.
  const f = nextMissing(i);
  if (f) return askField(i, f);
  if (!i.clientId) {
    i.asking = "client"; if (!i.asked.includes("client")) i.asked.push("client");
    return { intent: "create_job", thinking: [], kind: "job_intake", reply: "Last thing — which client is this for?", data: { pendingJob: i, field: "client", buttons: null } };
  }
  i.stage = "ready";
  return finalize(i, userId);
}

function slug(s: string): string {
  return (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client") + "-" + Math.random().toString(36).slice(2, 7);
}
