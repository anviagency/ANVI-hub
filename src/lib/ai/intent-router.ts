import { Intent, RoutedIntent } from "@/lib/types";
import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";
import { extractSkillsFromText } from "@/lib/ai/skills";

// Intent router (spec §2.3 / §11.4). Classifies a recruiter message into exactly
// one intent. Deterministic rules first cover the unambiguous cases; Claude is
// used (when available) for the fuzzy ones.

const VALID_INTENTS: Intent[] = [
  "create_job",
  "attach_client",
  "match_candidates",
  "search_candidates",
  "compare",
  "find_similar",
  "availability",
  "submit",
  "share",
  "explain",
  "summarize",
  "followup",
  "status",
  "smalltalk",
];

/** Fast, deterministic classification. Returns null when genuinely ambiguous. */
export function routeIntentDeterministic(text: string): RoutedIntent | null {
  const t = text.toLowerCase().trim();
  const entities: Record<string, unknown> = {};
  const countMatch = t.match(/top\s+(\d+)|\b(\d+)\s+candidates?\b/);
  if (countMatch) entities.count = parseInt(countMatch[1] ?? countMatch[2], 10);

  // compare "X and Y" / "X vs Y" — match on lowercase, extract names from original text.
  const cmp = t.match(/\bcompare\b\s+(.+)/);
  if (cmp || /\bvs\.?\b/.test(t)) {
    const original = cmp ? text.trim().replace(/^.*?\bcompare\b\s+/i, "") : text.trim();
    const names = original
      .split(/\s+(?:and|vs\.?|&|with)\s+/i)
      .map((s) => s.replace(/[^a-zà-ÿ\s-]/gi, "").trim())
      .filter(Boolean);
    return { intent: "compare", entities: { ...entities, names }, source: "deterministic" };
  }

  // summarize / profile of a candidate
  if (/\b(summari[sz]e|summary of|tell me about|profile of|brief on|who is)\b/.test(t)) {
    return { intent: "summarize", entities, source: "deterministic" };
  }

  // explain the matches / recommendations
  if (/\b(explain|why (these|them|that|this|did)|reason|justify|break ?down)\b/.test(t) && !/\bcompare\b/.test(t)) {
    return { intent: "explain", entities, source: "deterministic" };
  }

  // share / create a client link (must come before submit; both can say "with Andy")
  if (/\blink\b/.test(t) || /\b(share|generate|create|make)\b.*\b(portal|link)\b/.test(t) || /\bclient (link|portal)\b/.test(t)) {
    return { intent: "share", entities, source: "deterministic" };
  }

  // find similar / cheaper
  if (/\b(similar|like)\b/.test(t) && /\b(candidates?|devs?|developers?|engineers?|hire|profiles?|someone|to)\b/.test(t)) {
    entities.cheaper = /\b(cheaper|lower|less|budget)\b/.test(t);
    return { intent: "find_similar", entities, source: "deterministic" };
  }

  // availability
  if (/\b(available|availability|still free|on the market|free right now)\b/.test(t)) {
    return { intent: "availability", entities, source: "deterministic" };
  }

  // submit / send to client
  if (/\b(send|submit|present)\b/.test(t) && /\b(client|to|top|candidate)\b/.test(t)) {
    return { intent: "submit", entities, source: "deterministic" };
  }

  // followup / pending actions
  if (/\b(follow[\s-]?up|haven'?t (i )?contacted|stalled|idle|chase|pending|to ?do|next actions?|my actions|action items|what should i do|what needs)\b/.test(t)) {
    return { intent: "followup", entities, source: "deterministic" };
  }

  // status
  if (/\b(status|what'?s (up|happening)|where (are|is) we|how('?s| is) .* (going|doing))\b/.test(t)) {
    return { intent: "status", entities, source: "deterministic" };
  }

  // search the candidate POOL by attributes (skill / years / country), independent
  // of any job — e.g. "find candidates with 7 years Python", "who knows React".
  // Guard against job-creation phrasing ("need/hiring a Python dev with React").
  const skillsInText = extractSkillsFromText(text);
  const jobCreationPhrasing = /\b(need|hire|hiring|looking for|seeking|require|open(ing)?|post|recruit(ing)?|new (role|position|vacancy))\b/.test(t);
  const peopleNoun = /\b(candidates?|people|someone|anyone|profiles?|talent)\b/.test(t);
  const findVerbWithCriteria =
    /\b(find|search|show|who)\b/.test(t) && (/\d{1,2}\s*\+?\s*(?:years?|yrs?)/.test(t) || /\bknows?\b/.test(t));
  if (skillsInText.length >= 1 && !jobCreationPhrasing && (peopleNoun || findVerbWithCriteria)) {
    const ym = t.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/);
    entities.skills = skillsInText;
    if (ym) entities.minYears = parseInt(ym[1], 10);
    return { intent: "search_candidates", entities, source: "deterministic" };
  }

  // match candidates (for the job in focus)
  if (/\b(match|find( me)?|search|who|best|top|shortlist|candidates?)\b/.test(t)) {
    return { intent: "match_candidates", entities, source: "deterministic" };
  }

  // create job — verb + role/skill signal
  const createVerb = /\b(need|open|create|new|post|looking for|hire|hiring|seeking|require)\b/.test(t);
  const roleSignal =
    /\b(role|job|vacancy|position|developer|engineer|designer|dev|architect)\b/.test(t) ||
    extractSkillsFromText(text).length >= 2;
  if (createVerb && roleSignal) {
    return { intent: "create_job", entities, source: "deterministic" };
  }
  // Multi-line brief with skills strongly implies a job even without a verb.
  if (text.includes("\n") && extractSkillsFromText(text).length >= 2) {
    return { intent: "create_job", entities, source: "deterministic" };
  }

  return null;
}

const SYSTEM_PROMPT = `Classify the recruiter message into exactly one intent and extract entities. The message may be in English or Hebrew.
Intents:
- match_candidates: rank the best candidates for the CURRENT / most-recent open JOB.
- search_candidates: find candidates in the DATABASE by ATTRIBUTES (skills, years of experience, country, English level), NOT tied to a specific job. Examples: "find candidates with 7 years Python", "who knows React", "מצא מועמדים עם 7 שנות ניסיון בפייתון", "אנשים עם ניסיון ב-AWS".
- create_job, attach_client, compare, find_similar, availability, submit, share, explain, summarize, followup, status, smalltalk.
Use search_candidates when the message describes desired candidate attributes WITHOUT referring to a specific open role.
Return ONLY JSON: {"intent": "<one intent>", "entities": {"names": [string], "count": number, "client": string, "skills": [string], "min_years": number, "country": string, "english_level": string}}
For skills, use canonical technology/skill names (e.g. "Python", "React", "AWS").`;

interface LlmIntent {
  intent: string;
  entities?: Record<string, unknown>;
}

export async function routeIntent(text: string): Promise<RoutedIntent> {
  const deterministic = routeIntentDeterministic(text);
  if (deterministic) return deterministic;

  if (aiEnabled) {
    const llm = await completeJson<LlmIntent>({
      model: MODEL_FAST,
      system: SYSTEM_PROMPT,
      user: text,
      maxTokens: 200,
    });
    if (llm && VALID_INTENTS.includes(llm.intent as Intent)) {
      return { intent: llm.intent as Intent, entities: llm.entities ?? {}, source: "llm" };
    }
  }

  // Final fallback: treat a short single-line message as smalltalk, longer as a job.
  if (text.trim().split(/\s+/).length <= 4 && !text.includes("\n")) {
    return { intent: "smalltalk", entities: {}, source: "deterministic" };
  }
  return { intent: "create_job", entities: {}, source: "deterministic" };
}
