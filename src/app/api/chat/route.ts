import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { routeIntent } from "@/lib/ai/intent-router";
import { parseJob } from "@/lib/ai/job-parser";
import { loadJobRow, serializeMatch } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { aiEnabled } from "@/lib/ai/anthropic";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import {
  handleExplain, handleAvailability, handleSummarize, handleCompare, handleSubmit, handleShare, handlePending,
} from "@/lib/chat/copilot";

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

// The Recruiter Copilot brain (spec §2 / Mission 5.2). One endpoint, intent-routed.
// Auth-guarded because it reads candidate data and performs actions (submit/share).
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { message, context } = parsed.data;
  const jobId = context?.jobId;
  const routed = await routeIntent(message);
  const count = typeof routed.entities.count === "number" ? Math.min(routed.entities.count, 10) : 3;
  const names = Array.isArray(routed.entities.names) ? (routed.entities.names as string[]) : [];

  switch (routed.intent) {
    case "create_job":
      return handleCreateJob(message);
    case "match_candidates":
    case "find_similar":
      return handleMatch(message, jobId, routed.entities);
    case "status":
      return handleStatus();
    case "explain":
      return NextResponse.json(await handleExplain(message, jobId));
    case "availability":
      return NextResponse.json(await handleAvailability(message, jobId));
    case "summarize":
      return NextResponse.json(await handleSummarize(message, jobId));
    case "compare":
      return NextResponse.json(await handleCompare(message, names, jobId));
    case "submit":
      return NextResponse.json(await handleSubmit(message, count, auth.user.id, jobId));
    case "share":
      return NextResponse.json(await handleShare(message, count, auth.user.id, jobId));
    case "followup":
      return NextResponse.json(await handlePending());
    case "attach_client":
      return handleAttachClient(message);
    default:
      return handleFallback();
  }
}

async function handleAttachClient(message: string) {
  const { findClientInMessage } = await import("@/lib/chat/copilot");
  const client = await findClientInMessage(message);
  return NextResponse.json({
    intent: "attach_client",
    thinking: [],
    reply: client
      ? `Found client ${client.company ?? client.name}. Paste or open the role and I'll attach it.`
      : "Tell me the client name and I'll resolve or create it when you save a role.",
    kind: "fallback",
    data: { client: client ? { id: client.id, name: client.name, company: client.company } : null },
  });
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

function handleFallback() {
  return NextResponse.json({
    intent: "smalltalk",
    thinking: [],
    reply:
      "I can run your whole desk from here: paste a role to structure it, “match”, “explain the top candidates”, " +
      "“is Artem available?”, “summarize Sofia”, “compare Artem and Oleksandr”, “send top 3 to Andy”, " +
      "“share a client link”, or “what's pending?”.",
    kind: "fallback",
    data: {},
  });
}
void aiEnabled;
