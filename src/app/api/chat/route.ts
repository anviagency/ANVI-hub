import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { routeIntent } from "@/lib/ai/intent-router";
import { parseJob } from "@/lib/ai/job-parser";
import { loadJobRow, serializeMatch } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { aiEnabled } from "@/lib/ai/anthropic";

export const runtime = "nodejs";

const Body = z.object({
  message: z.string().min(1),
  context: z
    .object({
      jobId: z.string().optional(),
      pendingJob: z.unknown().optional(),
    })
    .optional(),
});

// The Recruiter Copilot brain (spec §2). One endpoint, intent-routed.
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { message, context } = parsed.data;
  const routed = await routeIntent(message);

  switch (routed.intent) {
    case "create_job":
      return handleCreateJob(message);
    case "match_candidates":
    case "find_similar":
      return handleMatch(message, context?.jobId, routed.entities);
    case "status":
      return handleStatus();
    case "availability":
    case "compare":
    case "submit":
    case "followup":
    case "attach_client":
      return handleNotYet(routed.intent);
    default:
      return handleFallback();
  }
}

async function handleCreateJob(message: string) {
  const job = await parseJob(message);
  if (!job.isJob) return handleFallback();

  // Try to find an existing client mentioned anywhere (best-effort).
  return NextResponse.json({
    intent: "create_job",
    thinking: [
      "Parsing role from your message…",
      "Extracting skills, seniority and budget…",
      job.missingFields.includes("client") ? "Checking which client this is for…" : "Structuring vacancy…",
    ],
    reply:
      "I structured this role from your brief. Review the fields, attach a client, and I'll save it — then say “match” to find candidates.",
    kind: "job_preview",
    data: { parsed: job, aiBacked: job.source === "llm" },
  });
}

async function handleMatch(message: string, jobId: string | undefined, entities: Record<string, unknown>) {
  // Resolve which job to match against: explicit context, else most recent open job.
  let job = jobId ? await loadJobRow(jobId) : null;
  if (!job) {
    const recent = await prisma.job.findFirst({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
    });
    if (recent) job = await loadJobRow(recent.id);
  }
  if (!job) {
    return NextResponse.json({
      intent: "match_candidates",
      thinking: ["Looking for an open role to match against…"],
      reply: "I don't have an open role yet. Paste a job description and I'll structure it first.",
      kind: "fallback",
      data: {},
    });
  }

  const cheaper = entities.cheaper === true || /\b(cheaper|under budget|lower)\b/i.test(message);
  const results = await runMatch(job, { limit: 6 });
  let serialized = results.map(serializeMatch);
  if (cheaper && job.budgetMax) {
    const mid = job.budgetMax * 0.85;
    serialized = serialized.filter((c) => (c.clientRate ?? Infinity) <= mid);
  }

  // Cache the analyses so the candidate workspace can read them later.
  await persistAnalyses(job.id, results).catch((e) => console.error("persistAnalyses", e));

  const flagged = serialized.filter((c) => c.anomalies.length > 0).length;
  return NextResponse.json({
    intent: "match_candidates",
    thinking: [
      "Stage 1 · filtering the talent pool by skills, years & availability…",
      "Stage 2 · running deep analysis + anomaly checks…",
      "Scoring fit and ranking…",
    ],
    reply: `Here ${serialized.length === 1 ? "is" : "are"} the ${serialized.length} strongest match${
      serialized.length === 1 ? "" : "es"
    } for ${job.title}${cheaper ? ", filtered to your budget" : ""}.${
      flagged > 0 ? ` ⚠️ ${flagged} ${flagged === 1 ? "has" : "have"} a red anomaly worth a look.` : ""
    }`,
    kind: "candidates",
    data: { jobId: job.id, jobTitle: job.title, list: serialized },
  });
}

async function handleStatus() {
  const jobs = await prisma.job.findMany({
    where: { status: "open" },
    include: { client: true, _count: { select: { submissions: true, analyses: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    intent: "status",
    thinking: ["Reading the current pipeline…"],
    reply: "Here's where your open roles stand right now.",
    kind: "status",
    data: {
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        client: j.client?.company ?? "—",
        analyzed: j._count.analyses,
        submitted: j._count.submissions,
      })),
    },
  });
}

function handleNotYet(intent: string) {
  return NextResponse.json({
    intent,
    thinking: [],
    reply:
      `“${intent.replace("_", " ")}” is part of a later build phase (WhatsApp/portal). ` +
      "In this slice I can structure roles, attach clients, and run deep candidate matching. Try “match”.",
    kind: "fallback",
    data: {},
  });
}

function handleFallback() {
  return NextResponse.json({
    intent: "smalltalk",
    thinking: [],
    reply: aiEnabled
      ? "I can open vacancies, structure roles, and search the talent pool with deep analysis. What are we hiring?"
      : "I can structure a role from a paste, attach a client, and run deep candidate matching with anomaly detection. Paste a job to start.",
    kind: "fallback",
    data: {},
  });
}
