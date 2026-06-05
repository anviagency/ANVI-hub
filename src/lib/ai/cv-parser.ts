import { extractSkillsFromText, canonicalizeSkill } from "@/lib/ai/skills";
import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";

// CV parser (Mission 5.1 P2). Extracts structured candidate data from pasted CV
// text. Deterministic engine always available; Claude used when configured.

export interface ParsedCV {
  fullName: string | null;
  title: string | null;
  country: string | null;
  englishLevel: string | null;
  seniority: string | null;
  totalYears: number | null;
  skills: { name: string; years: number }[];
  source: "llm" | "deterministic";
}

const COUNTRIES = [
  "Ukraine", "Poland", "Spain", "Germany", "Portugal", "Romania", "Estonia", "Czechia", "Bulgaria",
  "Argentina", "Brazil", "Mexico", "United States", "United Kingdom", "Netherlands", "France", "Italy",
  "Georgia", "Armenia", "Serbia", "Croatia", "Lithuania", "Latvia", "Moldova", "Turkey", "India", "Canada",
];

const SENIORITY: [RegExp, string][] = [
  [/\b(principal|staff)\b/i, "Principal"],
  [/\b(senior|sr\.?|lead)\b/i, "Senior"],
  [/\b(mid[\s-]?level|middle\+?|intermediate)\b/i, "Middle"],
  [/\b(junior|jr\.?|entry)\b/i, "Junior"],
];

const ENGLISH: [RegExp, string][] = [
  [/\b(native|fluent|c2)\b/i, "Fluent"],
  [/\bc1\b/i, "C1"],
  [/\b(upper[\s-]?intermediate|b2\+?)\b/i, "B2+"],
  [/\bb1\b/i, "B1"],
];

export function parseCvDeterministic(text: string): ParsedCV {
  const t = text.trim();
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Name: first non-empty line that looks like a person name (<= 4 words, letters).
  let fullName: string | null = null;
  for (const l of lines.slice(0, 4)) {
    if (/^[A-Za-zÀ-ÿ'.-]+(\s+[A-Za-zÀ-ÿ'.-]+){1,3}$/.test(l) && l.split(/\s+/).length <= 4 && !/curriculum|resume|cv/i.test(l)) {
      fullName = l;
      break;
    }
  }

  const seniority = SENIORITY.find(([re]) => re.test(t))?.[1] ?? null;
  const englishLevel = ENGLISH.find(([re]) => re.test(t))?.[1] ?? null;
  const country = COUNTRIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(t)) ?? null;

  const yearsMatch = t.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i);
  const totalYears = yearsMatch ? parseInt(yearsMatch[1], 10) : null;

  // Title: a line containing a role keyword.
  const title =
    lines.find((l) => /\b(developer|engineer|designer|architect|manager|lead|consultant|scientist|analyst)\b/i.test(l) && l.length <= 80) ?? null;

  // Skills: canonical skills found, each defaulted to a fraction of total experience
  // (NOT zero — that would fail every min-years filter).
  const defaultYears = totalYears ? Math.max(1, Math.round(totalYears * 0.6)) : 2;
  const skills = extractSkillsFromText(t).map((name) => ({ name, years: defaultYears }));

  return {
    fullName,
    title,
    country,
    englishLevel,
    seniority,
    totalYears,
    skills,
    source: "deterministic",
  };
}

const SYSTEM = `Extract structured data from a candidate CV. Return ONLY JSON:
{"full_name":string|null,"title":string|null,"country":string|null,"english_level":string|null,"seniority":string|null,"total_years":number|null,"skills":[{"name":string,"years":number}]}
Estimate per-skill years from context; never return 0 for a clearly-used skill.`;

interface LlmCV {
  full_name: string | null; title: string | null; country: string | null; english_level: string | null;
  seniority: string | null; total_years: number | null; skills: { name: string; years: number }[];
}

export async function parseCv(text: string): Promise<ParsedCV> {
  if (aiEnabled) {
    const llm = await completeJson<LlmCV>({ model: MODEL_FAST, system: SYSTEM, user: text.slice(0, 8000), maxTokens: 900 });
    if (llm && (llm.skills || llm.full_name)) {
      return {
        fullName: llm.full_name, title: llm.title, country: llm.country, englishLevel: llm.english_level,
        seniority: llm.seniority, totalYears: llm.total_years,
        skills: (llm.skills ?? []).map((s) => ({ name: canonicalizeSkill(s.name) ?? s.name, years: s.years > 0 ? s.years : 2 })).filter((s) => s.name),
        source: "llm",
      };
    }
  }
  return parseCvDeterministic(text);
}
