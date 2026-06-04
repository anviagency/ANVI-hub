import Anthropic from "@anthropic-ai/sdk";

// Thin wrapper around the Anthropic SDK. The whole product degrades gracefully:
// when ANTHROPIC_API_KEY is absent, callers fall back to deterministic engines.

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

export const aiEnabled = Boolean(apiKey);

export const MODEL_FAST = process.env.ANVI_MODEL_FAST?.trim() || "claude-sonnet-4-6";
export const MODEL_DEEP = process.env.ANVI_MODEL_DEEP?.trim() || "claude-opus-4-8";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

/**
 * Ask Claude for a JSON object and parse it. Returns null on any failure
 * (no key, network error, malformed JSON) so callers can fall back cleanly.
 */
export async function completeJson<T>(opts: {
  model?: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T | null> {
  if (!aiEnabled) return null;
  try {
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
    console.error("[anvi] Anthropic call failed, falling back:", (err as Error).message);
    return null;
  }
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
