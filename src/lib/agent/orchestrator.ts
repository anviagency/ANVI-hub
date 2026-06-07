import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";
import { routeIntentDeterministic } from "@/lib/ai/intent-router";
import { TOOL_BY_NAME, toolCatalog, type ToolContext } from "@/lib/agent/tools";
import type { ChatResult } from "@/lib/chat/copilot";

// AI agent orchestrator (Mission 10 Phase 0/1). The AI is the decision layer: it
// understands the message, decides whether to ACT (call a tool), ASK (for a
// genuinely missing field), or hand off to conversational job creation. The
// deterministic tools do the work. Returns null when the AI is unavailable or
// uncertain so the caller falls back to the deterministic router (never breaks).

export interface AgentPlan {
  reasoning?: string;
  action: "tool" | "ask" | "create_job" | "none";
  tool?: string | null;
  args?: Record<string, unknown>;
  ask?: string | null;
  confirm?: string | null;
  followup?: string | null;
}

export interface PendingAction {
  tool: string;
  args: Record<string, unknown>;
}

// AI-first by default whenever an AI provider is configured. AI_AGENT=0 is an
// explicit kill switch back to the deterministic router; AI_AGENT=1 forces it on.
export const AGENT_ENABLED = () => process.env.AI_AGENT === "1" || (aiEnabled && process.env.AI_AGENT !== "0");

const AFFIRMATIVE = /^(y|yes|yep|yeah|sure|ok|okay|confirm|go ahead|do it|send|share|proceed|כן|בצע|שלח|אישור)\b/i;
export function isAffirmative(message: string): boolean {
  return AFFIRMATIVE.test(message.trim());
}

function systemPrompt(): string {
  const tools = toolCatalog()
    .map((t) => `- ${t.name}${t.sensitive ? " (sensitive: confirm first)" : ""}: ${t.description}`)
    .join("\n");
  return `You are ANVI, a world-class AI recruiting partner. Decide what to do with the recruiter's message.
You may: call ONE tool to act, ASK for a single genuinely-missing piece of info, or route to job creation.
Never require magic words or exact phrasing. Act when confident and the action is safe; ask only when a required input is missing. The message may be English or Hebrew.

Tools:
${tools}

If the message describes a NEW role/job to open, set action="create_job".
If you need a missing required field (e.g. client, budget) to proceed, set action="ask" with a short question.
Otherwise set action="tool" with the best tool and its args.
Always include a short, friendly "followup" proposing the next best step.

Return ONLY JSON: {"reasoning": string, "action": "tool"|"ask"|"create_job"|"none", "tool": string|null, "args": object, "ask": string|null, "followup": string|null}`;
}

/** Plan the next action with the AI. Returns null when AI is off/unavailable. */
export async function planAction(message: string, ctx: ToolContext): Promise<AgentPlan | null> {
  if (!aiEnabled) return null;
  const plan = await completeJson<AgentPlan>({
    model: MODEL_FAST,
    system: systemPrompt(),
    user: `Recruiter message: ${message}\nContext: ${ctx.jobId ? `a job is in focus (id ${ctx.jobId})` : "no specific job in focus"}.`,
    maxTokens: 400,
  });
  if (!plan || !plan.action) return null;
  return plan;
}

export interface AgentOutcome {
  result: ChatResult;
  /** True when a sensitive tool was requested and a confirm is required before running it. */
  needsConfirm?: boolean;
}

/** Execute a previously-confirmed sensitive action. */
export async function runConfirmedAction(pending: PendingAction, ctx: ToolContext): Promise<ChatResult | null> {
  const tool = TOOL_BY_NAME.get(pending.tool);
  if (!tool) return null;
  const parsed = tool.params.safeParse(pending.args ?? {});
  const args = parsed.success ? (parsed.data as Record<string, unknown>) : {};
  return tool.run(args, ctx);
}

/**
 * Run one agent turn. Returns null to signal "fall back to the deterministic
 * router" (AI off, no plan, or a plan the deterministic path handles better).
 */
export async function runAgent(message: string, ctx: ToolContext): Promise<AgentOutcome | null> {
  // Deterministic safety net: opening a new role is a reliable, well-tested
  // detection and a special conversational flow. Trust it over the LLM (which can
  // mistake "we need a Senior Python dev" for a candidate search) and hand off to
  // the intake state machine.
  if (routeIntentDeterministic(message)?.intent === "create_job") return null;

  const plan = await planAction(message, ctx);
  if (!plan) return null;

  if (plan.action === "create_job") {
    // Conversational job creation stays with the intake state machine.
    return null;
  }

  if (plan.action === "ask" && plan.ask) {
    return {
      result: {
        intent: "assistant",
        thinking: plan.reasoning ? [plan.reasoning] : [],
        reply: plan.ask,
        kind: "fallback",
        data: { awaitingInput: true },
      },
    };
  }

  if (plan.action === "tool" && plan.tool) {
    const tool = TOOL_BY_NAME.get(plan.tool);
    if (!tool) return null; // unknown tool → deterministic fallback
    const parsed = tool.params.safeParse(plan.args ?? {});
    const args = parsed.success ? (parsed.data as Record<string, unknown>) : {};

    // Sensitive tools (submit / share — client-facing, irreversible) are NOT
    // executed immediately: ask for a one-tap confirm and carry the action.
    if (tool.sensitive) {
      const pendingAction: PendingAction = { tool: tool.name, args };
      return {
        result: {
          intent: "confirm",
          thinking: plan.reasoning ? [plan.reasoning] : [],
          reply: plan.confirm ?? `I'm ready to ${tool.description.toLowerCase()} Confirm and I'll do it.`,
          kind: "confirm",
          data: { pendingAction },
        },
        needsConfirm: true,
      };
    }

    const result = await tool.run(args, ctx);
    const withFollowup = plan.followup ? { ...result, reply: `${result.reply}\n\n${plan.followup}` } : result;
    return { result: withFollowup };
  }

  return null;
}
