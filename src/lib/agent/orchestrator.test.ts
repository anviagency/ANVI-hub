import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI wrapper so we can drive the agent plan deterministically.
vi.mock("@/lib/ai/anthropic", () => ({
  aiEnabled: true,
  MODEL_FAST: "test-model",
  completeJson: vi.fn(),
}));

// Mock the handlers so tools don't touch the DB — each returns a sentinel result.
vi.mock("@/lib/chat/copilot", () => {
  const make = (intent: string) => vi.fn(async () => ({ intent, thinking: [], reply: `ran ${intent}`, kind: "candidates", data: {} }));
  return {
    handleExplain: make("explain"),
    handleAvailability: make("availability"),
    handleSummarize: make("summarize"),
    handleCompare: make("compare"),
    handleSubmit: make("submit"),
    handleShare: make("share"),
    handlePending: make("followup"),
    handleSearchCandidates: vi.fn(async () => ({ intent: "search_candidates", thinking: [], reply: "found candidates", kind: "candidates", data: { list: [] } })),
    handleMatchForJob: make("match_candidates"),
  };
});

import { runAgent, runConfirmedAction } from "./orchestrator";
import { completeJson } from "@/lib/ai/anthropic";
import { handleSearchCandidates, handleSubmit } from "@/lib/chat/copilot";

const ctx = { userId: "u1", message: "hi" };
const mockPlan = (plan: unknown) => (completeJson as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(plan);

describe("agent orchestrator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back (returns null) when the AI produces no plan", async () => {
    mockPlan(null);
    expect(await runAgent("anything", ctx)).toBeNull();
  });

  it("dispatches a tool call to the right handler", async () => {
    mockPlan({ action: "tool", tool: "search_candidates", args: { skills: ["Python"], minYears: 7 }, followup: "Want a shortlist?" });
    const out = await runAgent("find python people", ctx);
    expect(out?.result.intent).toBe("search_candidates");
    expect(out?.result.reply).toContain("found candidates");
    expect(out?.result.reply).toContain("Want a shortlist?"); // follow-up appended
    expect(handleSearchCandidates).toHaveBeenCalledOnce();
  });

  it("validates/coerces tool args via the tool schema", async () => {
    // bad args (skills should be string[]) → schema falls back to {} but still runs
    mockPlan({ action: "tool", tool: "search_candidates", args: { skills: "not-an-array" } });
    const out = await runAgent("x", ctx);
    expect(out?.result.intent).toBe("search_candidates");
  });

  it("asks for a missing field instead of acting", async () => {
    mockPlan({ action: "ask", ask: "Who is this role for?" });
    const out = await runAgent("handle that for me", ctx);
    expect(out?.result.reply).toBe("Who is this role for?");
    expect(out?.result.data.awaitingInput).toBe(true);
  });

  it("asks to confirm sensitive tools WITHOUT executing them", async () => {
    mockPlan({ action: "tool", tool: "submit_candidates", args: { count: 3 }, confirm: "Submit top 3 to the client?" });
    const out = await runAgent("send the top 3", ctx);
    expect(out?.needsConfirm).toBe(true);
    expect(out?.result.kind).toBe("confirm");
    expect((out?.result.data as { pendingAction?: { tool: string } }).pendingAction?.tool).toBe("submit_candidates");
    expect(handleSubmit).not.toHaveBeenCalled(); // not executed until confirmed
  });

  it("executes a confirmed sensitive action", async () => {
    const done = await runConfirmedAction({ tool: "submit_candidates", args: { count: 3 } }, ctx);
    expect(done?.intent).toBe("submit");
    expect(handleSubmit).toHaveBeenCalledOnce();
  });

  it("hands job creation back to the intake state machine (returns null)", async () => {
    mockPlan({ action: "create_job" });
    expect(await runAgent("we need a senior python dev", ctx)).toBeNull();
  });

  it("falls back when the AI names an unknown tool", async () => {
    mockPlan({ action: "tool", tool: "nonexistent_tool", args: {} });
    expect(await runAgent("x", ctx)).toBeNull();
  });
});
