import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { routeIntent } from "@/lib/ai/intent-router";
import { loadJobRow, serializeMatch } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { aiEnabled } from "@/lib/ai/anthropic";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import {
  handleExplain, handleAvailability, handleSummarize, handleCompare, handleSubmit, handleShare, handlePending, handleSearchCandidates, handleSimilar, handleClientPackage,
} from "@/lib/chat/copilot";
import { extractSkillsFromText } from "@/lib/ai/skills";
import { runIntake, JobIntake } from "@/lib/chat/intake";
import { runAgent, runConfirmedAction, isAffirmative, AGENT_ENABLED, type PendingAction } from "@/lib/agent/orchestrator";

export const runtime = "nodejs";

const Body = z.object({
  message: z.string().min(1),
  context: z
    .object({
      jobId: z.string().optional(),
      pendingJob: z.unknown().optional(),
      pendingAction: z.unknown().optional(),
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

  // Mid-conversation job intake (Mission 7.1): if we're gathering fields, keep
  // gathering — don't re-classify the recruiter's answer as a new intent.
  const pending = context?.pendingJob as JobIntake | undefined;
  if (pending && (pending.asking || pending.stage === "confirm_client" || pending.stage === "create_client")) {
    return NextResponse.json(await runIntake(message, pending, auth.user.id));
  }

  // A pending sensitive action awaiting confirmation: execute on a yes, else drop it.
  const pendingAction = context?.pendingAction as PendingAction | undefined;
  if (pendingAction?.tool) {
    if (isAffirmative(message)) {
      const done = await runConfirmedAction(pendingAction, { userId: auth.user.id, jobId, message });
      if (done) return NextResponse.json(done);
    }
    // Not affirmative → fall through and treat as a fresh message (pending cleared client-side).
  }

  // AI-first decision layer (Mission 10). When enabled, the AI understands and
  // decides; it returns null to fall back to the deterministic router below, so
  // the system never breaks if the AI is off or uncertain.
  if (AGENT_ENABLED()) {
    try {
      const outcome = await runAgent(message, { userId: auth.user.id, jobId, message });
      if (outcome) return NextResponse.json(outcome.result);
    } catch (e) {
      console.error("agent orchestrator failed, falling back:", (e as Error).message);
    }
  }

  const routed = await routeIntent(message);
  const count = typeof routed.entities.count === "number" ? Math.min(routed.entities.count, 10) : 3;
  const names = Array.isArray(routed.entities.names) ? (routed.entities.names as string[]) : [];

  switch (routed.intent) {
    case "create_job":
      return NextResponse.json(await runIntake(message, null, auth.user.id));
    case "search_candidates":
      return NextResponse.json(await handleSearchCandidates(message, routed.entities));
    case "find_similar":
      // First-class candidate similarity — never silently a job match (Phase 5).
      return NextResponse.json(await handleSimilar(message, jobId));
    case "client_package":
      return NextResponse.json(await handleClientPackage(message, auth.user.id, jobId));
    case "match_candidates":
      // No job in focus + the query names concrete skills → it's a pool search,
      // not a job match (e.g. "find candidates with 7 years Python"). Don't
      // silently match the most-recent job and ignore the criteria.
      if (!jobId && extractSkillsFromText(message).length >= 1) {
        return NextResponse.json(await handleSearchCandidates(message, routed.entities));
      }
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
      "“is this candidate available?”, “summarize a candidate”, “compare the top two”, “send the top 3 to the client”, " +
      "“share a client link”, or “what's pending?”.",
    kind: "fallback",
    data: {},
  });
}
void aiEnabled;
