import { Anomaly, CandidateInput, EmploymentRecord } from "@/lib/types";
import { skillReleaseYear } from "@/lib/ai/skills";

// Deterministic anomaly engine (spec §4.3 / §11.2). These are the "trust-killer"
// red flags. They are explicit, rule-based checks — NOT vague LLM "find problems".
// Pure functions so they are fully unit-testable without a DB or network.

const SENIOR_WORDS = /\b(senior|sr\.?|lead)\b/i;
const ARCHITECT_WORDS = /\b(architect|principal|staff|head of|director|vp)\b/i;

function monthsToAbsolute(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** Career length in years, derived from the best signal available. */
export function careerYears(c: CandidateInput, currentYear: number): number {
  if (c.careerStartYear) return Math.max(0, currentYear - c.careerStartYear);
  if (c.employments.length > 0) {
    const earliest = Math.min(...c.employments.map((e) => e.startYear));
    return Math.max(0, currentYear - earliest);
  }
  return c.totalYears ?? 0;
}

function spanMonths(e: EmploymentRecord, currentYear: number, currentMonth: number): [number, number] {
  const start = monthsToAbsolute(e.startYear, e.startMonth);
  const end =
    e.endYear !== null && e.endMonth !== null
      ? monthsToAbsolute(e.endYear, e.endMonth)
      : monthsToAbsolute(currentYear, currentMonth);
  return [start, end];
}

export interface AnomalyOptions {
  currentYear: number;
  currentMonth?: number; // 1-12, defaults to 6
}

export function detectAnomalies(c: CandidateInput, opts: AnomalyOptions): Anomaly[] {
  const currentYear = opts.currentYear;
  const currentMonth = opts.currentMonth ?? 6;
  const anomalies: Anomaly[] = [];
  const years = careerYears(c, currentYear);

  // 1. Impossible tenure: skill claimed for longer than the tech has existed.
  for (const s of c.skills) {
    const release = skillReleaseYear(s.name);
    if (release !== undefined) {
      const maxPossible = currentYear - release;
      if (s.years > maxPossible) {
        anomalies.push({
          text: `Claims ${formatYears(s.years)} of ${s.name} — ${s.name} was released in ${release} (max ${maxPossible}y possible).`,
          rule: "skill_years > current_year - skill_release_year",
          severity: "high",
        });
      }
    }
  }

  // 2. Skill tenure exceeds total career length.
  if (years > 0) {
    for (const s of c.skills) {
      if (s.years > years + 0.5) {
        anomalies.push({
          text: `Claims ${formatYears(s.years)} of ${s.name} but total career is only ~${formatYears(years)}.`,
          rule: "skill_years > total_career_years",
          severity: "high",
        });
      }
    }
  }

  // 3. Overlapping full-time employment.
  const fullTime = c.employments
    .filter((e) => e.fullTime)
    .map((e) => ({ e, span: spanMonths(e, currentYear, currentMonth) }))
    .sort((a, b) => a.span[0] - b.span[0]);
  for (let i = 0; i < fullTime.length; i++) {
    for (let j = i + 1; j < fullTime.length; j++) {
      const [aStart, aEnd] = fullTime[i].span;
      const [bStart, bEnd] = fullTime[j].span;
      const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
      if (overlap > 1) {
        anomalies.push({
          text: `Overlapping full-time roles: "${fullTime[i].e.company}" and "${fullTime[j].e.company}" run simultaneously (~${overlap} months).`,
          rule: "overlapping full-time employment dates",
          severity: "high",
        });
      }
    }
  }

  // 4. Seniority title inconsistent with total experience.
  const title = c.title ?? "";
  if (ARCHITECT_WORDS.test(title) && years < 5) {
    anomalies.push({
      text: `Title "${title}" with only ~${formatYears(years)} total experience.`,
      rule: "seniority title inconsistent with total experience",
      severity: "med",
    });
  } else if (SENIOR_WORDS.test(title) && years > 0 && years < 3) {
    anomalies.push({
      text: `"Senior" title with only ~${formatYears(years)} total experience.`,
      rule: "seniority title inconsistent with total experience",
      severity: "med",
    });
  }

  // 5. CV vs LinkedIn title conflict.
  if (c.linkedinTitle && title) {
    const cvSenior = SENIOR_WORDS.test(title) || ARCHITECT_WORDS.test(title);
    const liSenior = SENIOR_WORDS.test(c.linkedinTitle) || ARCHITECT_WORDS.test(c.linkedinTitle);
    if (cvSenior !== liSenior) {
      anomalies.push({
        text: `CV title "${title}" conflicts with LinkedIn title "${c.linkedinTitle}".`,
        rule: "CV vs LinkedIn title/date conflicts",
        severity: "med",
      });
    }
  }

  // 6. Unexplained employment gap > 6 months between consecutive roles.
  const sorted = c.employments
    .map((e) => ({ e, span: spanMonths(e, currentYear, currentMonth) }))
    .sort((a, b) => a.span[0] - b.span[0]);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].span[1];
    const curStart = sorted[i].span[0];
    const gap = curStart - prevEnd;
    if (gap > 6) {
      const fromYear = Math.floor(prevEnd / 12);
      const toYear = Math.floor(curStart / 12);
      anomalies.push({
        text: `${gap}-month employment gap (${fromYear}–${toYear}) — unexplained.`,
        rule: "unexplained employment gaps > 6 months",
        severity: gap > 12 ? "med" : "low",
      });
    }
  }

  // 7. Suspicious employment pattern: many very-short stints packed into a short
  //    career (classic CV padding / job-hopping beyond normal churn).
  const shortStints = c.employments.filter(
    (e) => e.endYear !== null && monthsToAbsolute(e.endYear, e.endMonth ?? 1) - monthsToAbsolute(e.startYear, e.startMonth) < 12
  ).length;
  if (shortStints >= 4 && years > 0 && years < shortStints * 0.9) {
    anomalies.push({
      text: `${shortStints} roles under 1 year across ~${formatYears(years)} — suspicious employment density.`,
      rule: "suspicious employment pattern",
      severity: "med",
    });
  }

  return anomalies;
}

/**
 * Cross-candidate duplicate detection (mission Part 1). Two candidates are
 * duplicates if they share an email, or the same normalized name + country.
 * Returns one anomaly per candidate that belongs to a duplicate group.
 */
export function detectDuplicates(candidates: CandidateInput[]): Map<string, Anomaly> {
  const groups = new Map<string, { id: string; name: string }[]>();
  const keyFor = (c: CandidateInput): string => {
    const email = (c.email ?? "").trim().toLowerCase();
    if (email) return `email:${email}`;
    const name = c.fullName.trim().toLowerCase().replace(/\s+/g, " ");
    return `name:${name}|${(c.country ?? "").trim().toLowerCase()}`;
  };
  for (const c of candidates) {
    const k = keyFor(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({ id: c.id, name: c.fullName });
  }
  const out = new Map<string, Anomaly>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    for (const m of members) {
      const others = members.filter((x) => x.id !== m.id).map((x) => x.name);
      out.set(m.id, {
        text: `Possible duplicate candidate — shares identity with ${others.join(", ")}.`,
        rule: "duplicate candidate",
        severity: "high",
      });
    }
  }
  return out;
}

function formatYears(y: number): string {
  if (Number.isInteger(y)) return `${y} years`;
  return `${y.toFixed(1)} years`;
}
