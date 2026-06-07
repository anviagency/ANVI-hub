import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";

// CV writing-quality / spelling analysis (recruiter-facing signal). Uses the
// configured LLM; returns null when AI is disabled so callers degrade cleanly.
// This is intentionally a separate, lazy call (not part of the hot profile load).

export interface WritingQuality {
  issues: number; // count of spelling/grammar mistakes found
  examples: { wrong: string; suggestion: string }[];
  assessment: string; // one-line human-readable verdict
  band: "clean" | "minor" | "poor";
}

const SYSTEM = `You are a meticulous proofreader reviewing a candidate's CV text.
Identify genuine SPELLING and grammar mistakes only — ignore names, companies,
technologies, acronyms, and stylistic choices. Return ONLY JSON:
{"issues": number, "examples": [{"wrong": string, "suggestion": string}], "assessment": string}
- issues: total count of real spelling/grammar errors.
- examples: up to 6 of the clearest errors with a correction.
- assessment: one short sentence on the CV's writing quality.`;

interface LlmWriting {
  issues: number;
  examples: { wrong: string; suggestion: string }[];
  assessment: string;
}

/**
 * Analyze a CV's spelling/grammar quality via the LLM. Returns null when AI is
 * off or the call fails (caller shows "not analyzed"). Pure I/O wrapper.
 */
export async function analyzeWriting(cvText: string): Promise<WritingQuality | null> {
  if (!aiEnabled) return null;
  const text = (cvText ?? "").trim();
  if (text.length < 40) return null;
  try {
    const llm = await completeJson<LlmWriting>({
      model: MODEL_FAST,
      system: SYSTEM,
      user: text.slice(0, 8000),
      // Generous budget: gemini-2.5-flash is a "thinking" model and can exhaust a
      // small budget before emitting the JSON body.
      maxTokens: 2048,
    });
    if (!llm || typeof llm.issues !== "number") return null;
    const issues = Math.max(0, Math.round(llm.issues));
    const band: WritingQuality["band"] = issues === 0 ? "clean" : issues <= 4 ? "minor" : "poor";
    return {
      issues,
      examples: Array.isArray(llm.examples) ? llm.examples.slice(0, 6).filter((e) => e && e.wrong) : [],
      assessment: typeof llm.assessment === "string" ? llm.assessment : "",
      band,
    };
  } catch {
    return null;
  }
}
