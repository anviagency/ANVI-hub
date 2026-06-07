import { z } from "zod";
import {
  handleExplain,
  handleAvailability,
  handleSummarize,
  handleCompare,
  handleSubmit,
  handleShare,
  handlePending,
  handleSearchCandidates,
  handleMatchForJob,
  handleSafest,
  handleShortlist,
  type ChatResult,
} from "@/lib/chat/copilot";

// Agent tool registry (Mission 10 Phase 0). Each EXISTING handler is exposed as a
// typed tool so the AI decision layer can call it — the deterministic handlers
// remain the execution layer (the "tools"), the AI becomes the "brain".

export interface ToolContext {
  userId: string;
  jobId?: string;
  message: string;
}

export interface Tool {
  name: string;
  description: string;
  params: z.ZodTypeAny;
  // Sensitive tools (money / client-facing / irreversible) require a confirm.
  sensitive?: boolean;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ChatResult>;
}

const num = z.number().int().positive().optional();
const strArr = z.array(z.string()).optional();

export const TOOLS: Tool[] = [
  {
    name: "match_for_job",
    description: "Rank the best candidates for the job currently in focus (or the most recent open role). Use when the user wants matches for a specific role.",
    params: z.object({ jobId: z.string().optional() }),
    run: (a, ctx) => handleMatchForJob(ctx.message, (a.jobId as string) ?? ctx.jobId, a),
  },
  {
    name: "search_candidates",
    description: "Search the candidate database by attributes (skills, minimum years, country) independent of any job. Use for 'find candidates with 7 years Python'.",
    params: z.object({ skills: strArr, minYears: z.number().optional(), country: z.string().optional() }),
    run: (a, ctx) => handleSearchCandidates(ctx.message, a),
  },
  {
    name: "explain_top",
    description: "Explain why the top candidates ranked highest for the role in focus, with score breakdowns.",
    params: z.object({ jobId: z.string().optional() }),
    run: (a, ctx) => handleExplain(ctx.message, (a.jobId as string) ?? ctx.jobId),
  },
  {
    name: "check_availability",
    description: "Report availability confidence for named candidates or the top matches.",
    params: z.object({ jobId: z.string().optional() }),
    run: (a, ctx) => handleAvailability(ctx.message, (a.jobId as string) ?? ctx.jobId),
  },
  {
    name: "summarize_candidate",
    description: "Summarize a single named candidate's profile.",
    params: z.object({ name: z.string().optional() }),
    run: (a, ctx) => handleSummarize(ctx.message, ctx.jobId),
  },
  {
    name: "compare_candidates",
    description: "Compare two named candidates side by side with a recommendation.",
    params: z.object({ names: strArr }),
    run: (a, ctx) => handleCompare(ctx.message, (a.names as string[]) ?? [], ctx.jobId),
  },
  {
    name: "submit_candidates",
    description: "Submit candidate(s) to the client for the role in focus. Sensitive: notifies the client.",
    params: z.object({ count: num, jobId: z.string().optional() }),
    sensitive: true,
    run: (a, ctx) => handleSubmit(ctx.message, (a.count as number) ?? 3, ctx.userId, (a.jobId as string) ?? ctx.jobId),
  },
  {
    name: "share_link",
    description: "Create a secure client share link for candidate(s) on the role in focus. Sensitive: exposes candidates to the client.",
    params: z.object({ count: num, jobId: z.string().optional() }),
    sensitive: true,
    run: (a, ctx) => handleShare(ctx.message, (a.count as number) ?? 3, ctx.userId, (a.jobId as string) ?? ctx.jobId),
  },
  {
    name: "safest_candidate",
    description: "Identify the safest candidate for the role in focus (fewest anomalies, best availability, solid fit). Use for 'who is safest / lowest risk'.",
    params: z.object({ jobId: z.string().optional() }),
    run: (a, ctx) => handleSafest(ctx.message, (a.jobId as string) ?? ctx.jobId),
  },
  {
    name: "build_shortlist",
    description: "Build a shortlist of the top N candidates for the role in focus, ready to share or package.",
    params: z.object({ count: num, jobId: z.string().optional() }),
    run: (a, ctx) => handleShortlist(ctx.message, (a.count as number) ?? 5, (a.jobId as string) ?? ctx.jobId),
  },
  {
    name: "pending_actions",
    description: "List open actions across the pipeline (what's pending / what to do next).",
    params: z.object({}),
    run: () => handlePending(),
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Compact tool catalog for the AI decision prompt. */
export function toolCatalog(): { name: string; description: string; sensitive: boolean }[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, sensitive: Boolean(t.sensitive) }));
}
