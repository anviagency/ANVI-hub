import Anthropic from "@anthropic-ai/sdk";

// Provider-agnostic LLM wrapper. Picks Gemini when GEMINI_API_KEY (or GOOGLE_API_KEY)
// is set, else Anthropic when ANTHROPIC_API_KEY is set, else nothing — in which case
// every caller falls back to its deterministic engine. (File kept as `anthropic.ts`
// for import stability.)

const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

export const aiProvider: "gemini" | "anthropic" | "none" = geminiKey ? "gemini" : anthropicKey ? "anthropic" : "none";
export const aiEnabled = aiProvider !== "none";

export const MODEL_FAST =
  aiProvider === "gemini"
    ? process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash"
    : process.env.ANVI_MODEL_FAST?.trim() || "claude-sonnet-4-6";
export const MODEL_DEEP =
  aiProvider === "gemini"
    ? process.env.GEMINI_MODEL_DEEP?.trim() || "gemini-2.5-pro"
    : process.env.ANVI_MODEL_DEEP?.trim() || "claude-opus-4-8";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: anthropicKey });
  return client;
}

/**
 * Ask the configured LLM for a JSON object and parse it. Returns null on any
 * failure (no key, network error, malformed JSON) so callers fall back cleanly.
 */
export async function completeJson<T>(opts: {
  model?: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T | null> {
  if (!aiEnabled) return null;
  try {
    if (aiProvider === "gemini") return await geminiJson<T>(opts);
    const res = await getClient().messages.create({
      model: opts.model ?? MODEL_FAST,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return extractJson<T>(text);
  } catch (err) {
    console.error(`[anvi] ${aiProvider} call failed, falling back:`, (err as Error).message);
    return null;
  }
}

async function geminiJson<T>(opts: { model?: string; system: string; user: string; maxTokens?: number }): Promise<T | null> {
  const model = opts.model && opts.model.startsWith("gemini") ? opts.model : MODEL_FAST;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      // These are structured-extraction tasks, not open reasoning. Disable
      // "thinking" (2.5-series) so the token budget goes to the JSON body — long
      // inputs otherwise exhaust the budget on thoughts and truncate the output.
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: opts.maxTokens ?? 1024, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) {
    console.error("[anvi] Gemini call failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return extractJson<T>(text);
}

/** Pull the first JSON object/array out of a model response, tolerating prose/fences. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  // Walk to the matching closing bracket.
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === open) depth++;
    else if (candidate[i] === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
