import { ParsedJob, ParsedSkill } from "@/lib/types";
import { extractSkillsFromText, canonicalizeSkill } from "@/lib/ai/skills";
import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";

// Job parser (spec §11.1). Two paths:
//   1. Claude (when a key is configured) — best extraction quality.
//   2. Deterministic regex/keyword engine — always available, fully functional.
// Both return the same ParsedJob shape.

const SENIORITY_PATTERNS: [RegExp, string][] = [
  [/\b(principal|staff)\b/i, "Principal"],
  [/\b(senior|sr\.?|lead)\b/i, "Senior"],
  [/\b(mid[\s-]?level|middle\+?|intermediate)\b/i, "Middle"],
  [/\b(junior|jr\.?|entry)\b/i, "Junior"],
];

const ENGLISH_PATTERNS: [RegExp, string][] = [
  [/\b(native|fluent|c2)\b/i, "Fluent"],
  [/\bc1\b/i, "C1"],
  [/\b(upper[\s-]?intermediate|b2\+?)\b/i, "B2+"],
  [/\bb1\b/i, "B1"],
  [/\b(conversational)\b/i, "Conversational"],
];

const ROLE_KEYWORDS =
  /\b(developer|engineer|designer|dev|architect|programmer|manager|analyst|scientist|devops|qa|tester|lead)\b/i;

function detectSeniority(text: string): string | null {
  for (const [re, label] of SENIORITY_PATTERNS) if (re.test(text)) return label;
  return null;
}

function detectEnglish(text: string): string | null {
  for (const [re, label] of ENGLISH_PATTERNS) if (re.test(text)) return label;
  return null;
}

function detectTitle(text: string, seniority: string | null): string | null {
  // Look at the first few lines for a role-ish phrase.
  const lines = text.split(/\n|\.|·|—/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (ROLE_KEYWORDS.test(line) && line.length <= 80) {
      // Strip leading verbs like "need", "looking for", "hiring".
      let cleaned = line.replace(
        /^\s*(i\s+)?(need|want|looking for|hiring|seeking|require|recruit(ing)?|open(ing)?|find( me)?|search(ing)? for)\s+(an?\s+)?/i,
        ""
      );
      cleaned = cleaned.replace(/\s+(with|who|that|having|for)\b.*$/i, "").trim();
      // Title-case lightly while preserving known acronyms in the text.
      const words = cleaned.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      const titled = words
        .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");
      return titled;
    }
  }
  return seniority ? null : null;
}

function detectExperienceYears(text: string): number | null {
  // "5+ years", "5 years experience", "min 3 yrs"
  const m = text.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

function detectBudget(text: string): ParsedJob["budget"] {
  // Examples: "$30/hour", "Budget 30$/hour", "$28-42/hr", "45-65$ per hour", "$5000/mo"
  const rangeHour = text.match(
    /\$?\s*(\d{1,3})\s*[-–—]\s*\$?\s*(\d{1,3})\s*\$?\s*(?:\/|per\s*)?\s*(hour|hr|h)\b/i
  );
  if (rangeHour) {
    return { min: parseInt(rangeHour[1], 10), max: parseInt(rangeHour[2], 10), unit: "usd_hour" };
  }
  const singleHour = text.match(/\$?\s*(\d{1,3})\s*\$?\s*(?:\/|per\s*)?\s*(hour|hr|h)\b/i);
  if (singleHour) {
    const v = parseInt(singleHour[1], 10);
    return { min: v, max: v, unit: "usd_hour" };
  }
  const month = text.match(/\$?\s*(\d{3,6})\s*\$?\s*(?:\/|per\s*)?\s*(month|mo|monthly)\b/i);
  if (month) {
    const v = parseInt(month[1], 10);
    return { min: v, max: v, unit: "usd_month" };
  }
  return { min: null, max: null, unit: null };
}

function detectSkills(text: string): ParsedSkill[] {
  const canonical = extractSkillsFromText(text);
  // A skill is "advantage" if it appears near words like advantage/plus/nice/bonus.
  return canonical.map((name) => {
    const idx = text.toLowerCase().indexOf(name.toLowerCase());
    // Look ahead for "advantage/plus" qualifiers (they follow the skill).
    const aheadWindow = idx >= 0 ? text.slice(idx, idx + name.length + 30).toLowerCase() : "";
    const advantage = /\b(advantage|plus|nice to have|bonus|preferred|a\s*\+)\b/.test(aheadWindow);
    // Per-skill years may appear before OR after the skill (e.g. "6 years AWS" / "AWS 6 yrs").
    const yearsWindow =
      idx >= 0 ? text.slice(Math.max(0, idx - 14), idx + name.length + 20).toLowerCase() : "";
    const ym = yearsWindow.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/);
    return {
      name,
      required: !advantage,
      minYears: ym ? parseInt(ym[1], 10) : null,
    };
  });
}

/** Deterministic parser — no network, always available. */
export function parseJobDeterministic(text: string): ParsedJob {
  const trimmed = text.trim();
  const skills = detectSkills(trimmed);
  const seniority = detectSeniority(trimmed);
  const looksLikeJob =
    ROLE_KEYWORDS.test(trimmed) ||
    skills.length >= 2 ||
    /\b(hire|hiring|vacancy|position|role|recruit)\b/i.test(trimmed);

  if (!looksLikeJob) {
    return {
      isJob: false,
      title: null,
      seniority: null,
      skills: [],
      experienceYearsMin: null,
      englishLevel: null,
      budget: { min: null, max: null, unit: null },
      missingFields: [],
      source: "deterministic",
    };
  }

  const title = detectTitle(trimmed, seniority);
  const experienceYearsMin = detectExperienceYears(trimmed);
  const englishLevel = detectEnglish(trimmed);
  const budget = detectBudget(trimmed);

  const missing: string[] = ["client"]; // client is always resolved separately
  if (!title) missing.push("title");
  if (skills.length === 0) missing.push("skills");

  return {
    isJob: true,
    title,
    seniority,
    skills,
    experienceYearsMin,
    englishLevel,
    budget,
    missingFields: missing,
    source: "deterministic",
  };
}

const SYSTEM_PROMPT = `You extract structured job data from a recruiter's free text.
Return ONLY valid JSON, no prose. Schema:
{
  "is_job": boolean,
  "title": string|null,
  "seniority": string|null,
  "skills": [{"name": string, "required": boolean, "min_years": number|null}],
  "experience_years_min": number|null,
  "english_level": string|null,
  "budget": {"min": number|null, "max": number|null, "unit": string|null},
  "missing_fields": [string]
}
Use unit "usd_hour" or "usd_month". If text is not a job, set is_job=false and leave fields null.`;

interface LlmJob {
  is_job: boolean;
  title: string | null;
  seniority: string | null;
  skills: { name: string; required: boolean; min_years: number | null }[];
  experience_years_min: number | null;
  english_level: string | null;
  budget: { min: number | null; max: number | null; unit: string | null };
  missing_fields: string[];
}

/** Parse via Claude when available, otherwise deterministic. Canonicalizes skills either way. */
export async function parseJob(text: string): Promise<ParsedJob> {
  if (aiEnabled) {
    const llm = await completeJson<LlmJob>({
      model: MODEL_FAST,
      system: SYSTEM_PROMPT,
      user: text,
      maxTokens: 800,
    });
    if (llm && typeof llm.is_job === "boolean") {
      const skills: ParsedSkill[] = (llm.skills ?? [])
        .map((s) => ({
          name: canonicalizeSkill(s.name) ?? s.name,
          required: s.required !== false,
          minYears: s.min_years ?? null,
        }))
        .filter((s) => s.name);
      const missing = new Set(llm.missing_fields ?? []);
      missing.add("client");
      return {
        isJob: llm.is_job,
        title: llm.title,
        seniority: llm.seniority,
        skills,
        experienceYearsMin: llm.experience_years_min,
        englishLevel: llm.english_level,
        budget: llm.budget ?? { min: null, max: null, unit: null },
        missingFields: [...missing],
        source: "llm",
      };
    }
  }
  return parseJobDeterministic(text);
}
