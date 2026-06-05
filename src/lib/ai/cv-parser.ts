import { extractSkillsFromText, canonicalizeSkill } from "@/lib/ai/skills";
import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";

// CV parser (Mission 5.1 P2). Extracts structured candidate data from pasted CV
// text. Deterministic engine always available; Claude used when configured.

export interface CvEmployment {
  company: string;
  title: string | null;
  start: string | null; // "YYYY-MM"
  end: string | null;   // "YYYY-MM" or null = current
}

export interface ParsedCV {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  nameConfidence: "high" | "low" | "none";
  warnings: string[];
  title: string | null;
  country: string | null;
  englishLevel: string | null;
  seniority: string | null;
  totalYears: number | null;
  summary: string | null;
  skills: { name: string; years: number }[];
  employments: CvEmployment[];
  source: "llm" | "deterministic";
}

const PHONE_RE = /(\+?\d[\d\s().\-]{7,}\d)/;
function findPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  return m ? m[1].replace(/[\s.\-()]+/g, "").replace(/^00/, "+") : null;
}

// Words that mark a line as a job title / seniority / section header — never a
// person's name. Covers tech and the marketing/ops/crypto roles ANVI recruits.
const NON_NAME = new RegExp(
  "\\b(" +
  // roles
  "developer|engineer|designer|architect|manager|lead|consultant|scientist|analyst|specialist|administrator|" +
  "programmer|devops|sre|intern|freelancer|founder|cto|ceo|cfo|coo|director|head|officer|expert|" +
  "frontend|front-end|backend|back-end|fullstack|full-stack|full stack|stack|qa|tester|recruiter|marketer|" +
  "copywriter|producer|buyer|trader|broker|accountant|affiliate|media|seo|sem|ppc|cro|funnel|automation|" +
  "campaigner|machinist|operator|cnc|technician|coordinator|associate|assistant|representative|" +
  // seniority
  "senior|junior|middle|mid-level|principal|staff|sr|jr|intermediate|entry|" +
  // section headers / document words
  "curriculum|resume|\\bcv\\b|summary|profile|experience|education|skills|contact|objective|about|" +
  "projects|employment|references|languages|certification|portfolio|achievements|work history" +
  ")\\b",
  "i"
);

const GENERIC_EMAIL_LOCAL = /^(info|hr|contact|admin|jobs?|cv|mail|hello|career|careers|recruit|recruiting|team|support|office|sales|no-?reply)$/i;
const EMAIL_RE = /([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/;

function titleCaseWord(w: string): string {
  return w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

/** True only for lines that look like a real human name (not a title/header). */
export function isLikelyName(line: string): boolean {
  const l = line.trim();
  if (l.length < 3 || l.length > 40) return false;
  if (/\d|@|[/_|•,:;()]/.test(l)) return false; // names don't carry digits, emails, separators
  if (NON_NAME.test(l)) return false; // title / seniority / section header
  const tokens = l.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  // every token is an alphabetic name-part (letters, apostrophe, hyphen, dot)
  if (!tokens.every((t) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\-]*$/.test(t))) return false;
  // require capitalisation: Title Case tokens, or an ALL-CAPS line ("ARTEM KHRANOVSKYI")
  const titleCase = tokens.filter((t) => /^[A-ZÀ-Ý]/.test(t)).length >= 2;
  const allCaps = /^[A-ZÀ-Ý'’.\-\s]+$/.test(l);
  return titleCase || allCaps;
}

function nameFromEmail(local: string): string | null {
  if (GENERIC_EMAIL_LOCAL.test(local)) return null;
  const parts = local.split(/[._\-+0-9]+/).filter((p) => p.length >= 2 && /^[A-Za-z]+$/.test(p));
  if (parts.length === 0) return null;
  return parts.slice(0, 3).map(titleCaseWord).join(" ");
}

/** Detect the candidate's name with a confidence level. Never invents a name. */
export function detectName(text: string): { name: string | null; confidence: "high" | "low" | "none"; email: string | null; warnings: string[] } {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const emailMatch = text.match(EMAIL_RE);
  const email = emailMatch ? `${emailMatch[1]}@${emailMatch[2]}`.toLowerCase() : null;
  const warnings: string[] = [];

  // 1. A clear human name near the top wins (skips title/header lines).
  for (const l of lines.slice(0, 8)) {
    if (isLikelyName(l)) {
      const allCaps = /^[A-ZÀ-Ý'’.\-\s]+$/.test(l);
      return { name: allCaps ? l.split(/\s+/).map(titleCaseWord).join(" ") : l, confidence: "high", email, warnings };
    }
  }

  // 2/3. No reliable name — derive a low-confidence one from the email if possible.
  if (emailMatch) {
    const derived = nameFromEmail(emailMatch[1]);
    if (derived) {
      warnings.push("name_derived_from_email");
      return { name: derived, confidence: "low", email, warnings };
    }
  }

  // 4. Nothing reliable — do NOT invent a name.
  warnings.push("no_reliable_name");
  return { name: null, confidence: "none", email, warnings };
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

  // Name detection: real name → email fallback (low confidence) → none. Never a title.
  const { name: fullName, confidence: nameConfidence, email, warnings } = detectName(t);

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
    email,
    phone: findPhone(t),
    location: null,
    nameConfidence,
    // No AI key → shallow extraction (uniform per-skill years, no summary/work history).
    warnings: [...warnings, "shallow_extraction_no_ai"],
    title,
    country,
    englishLevel,
    seniority,
    totalYears,
    summary: null,
    skills,
    employments: [],
    source: "deterministic",
  };
}

const SYSTEM = `You are a precise CV parser. Extract structured data from the candidate CV. Return ONLY JSON:
{"full_name":string|null,"email":string|null,"phone":string|null,"title":string|null,"country":string|null,"location":string|null,"english_level":string|null,"seniority":string|null,"total_years":number|null,"summary":string|null,"skills":[{"name":string,"years":number}],"employments":[{"company":string,"title":string|null,"start":"YYYY-MM"|null,"end":"YYYY-MM"|null}]}
Rules:
- full_name must be the person's name, NEVER a job title or section header. If unsure, null.
- Estimate per-skill years individually from where each skill appears in the work history — they should NOT all be equal, and never 0.
- summary: 2-3 sentence professional summary in your own words.
- employments: each real role with company, title, and start/end months (end null = current).
- english_level: one of Fluent, C1, B2+, B1 (infer if not explicit).`;

interface LlmCV {
  full_name: string | null; email: string | null; phone: string | null; title: string | null;
  country: string | null; location: string | null; english_level: string | null;
  seniority: string | null; total_years: number | null; summary: string | null;
  skills: { name: string; years: number }[];
  employments?: { company: string; title: string | null; start: string | null; end: string | null }[];
}

export async function parseCv(text: string): Promise<ParsedCV> {
  if (aiEnabled) {
    const llm = await completeJson<LlmCV>({ model: MODEL_FAST, system: SYSTEM, user: text.slice(0, 8000), maxTokens: 900 });
    if (llm && (llm.skills || llm.full_name)) {
      const det = detectName(text);
      // Trust the LLM name only if it's actually a name (not a title it echoed).
      const llmNameOk = !!llm.full_name && isLikelyName(llm.full_name);
      const fullName = llmNameOk ? llm.full_name! : det.name;
      const nameConfidence = llmNameOk ? "high" : det.confidence;
      const warnings = [...det.warnings];
      if (llm.full_name && !llmNameOk) warnings.push("llm_name_looked_like_title");
      return {
        fullName, email: llm.email ?? det.email, phone: llm.phone ?? findPhone(text),
        location: llm.location, nameConfidence, warnings,
        title: llm.title, country: llm.country, englishLevel: llm.english_level,
        seniority: llm.seniority, totalYears: llm.total_years, summary: llm.summary,
        skills: (llm.skills ?? []).map((s) => ({ name: canonicalizeSkill(s.name) ?? s.name, years: s.years > 0 ? s.years : 2 })).filter((s) => s.name),
        employments: (llm.employments ?? []).filter((e) => e.company).map((e) => ({ company: e.company, title: e.title, start: e.start, end: e.end })),
        source: "llm",
      };
    }
  }
  return parseCvDeterministic(text);
}
