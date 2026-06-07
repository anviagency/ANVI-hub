import { CandidateInput, EmploymentRecord } from "@/lib/types";
import { careerYears } from "@/lib/matching/anomaly";

// Candidate insights (recruiter-facing, internal). Deterministic, explainable,
// and unit-testable — NOT a black box. These complement the anomaly engine:
//   - scoreStability: job-hopping vs stability (spec §7.5 retention signal).
//   - detectNotableEmployers: recognised/large employers as a positive signal.
// Both degrade gracefully when employment history is missing.

function monthsAbs(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function tenureMonths(e: EmploymentRecord, curYear: number, curMonth: number): number {
  const start = monthsAbs(e.startYear, e.startMonth);
  const end = e.endYear !== null && e.endMonth !== null ? monthsAbs(e.endYear, e.endMonth) : monthsAbs(curYear, curMonth);
  return Math.max(0, end - start);
}

export type StabilityBand = "stable" | "moderate" | "job_hopper" | "insufficient";

export interface StabilityResult {
  score: number | null; // 0-100, higher = more stable; null when no history
  band: StabilityBand;
  avgTenureMonths: number | null;
  shortStints: number; // roles under 12 months
  roles: number;
  reasons: string[];
}

/**
 * Stability / retention signal from employment history. Higher = more stable.
 * Drivers: average tenure, share of sub-year stints, unexplained gaps, and
 * whether the candidate is currently employed.
 */
export function scoreStability(c: CandidateInput, currentYear: number, currentMonth = 6): StabilityResult {
  const emps = c.employments ?? [];
  if (emps.length === 0) {
    return { score: null, band: "insufficient", avgTenureMonths: null, shortStints: 0, roles: 0, reasons: ["No employment history extracted — re-import the CV with AI for tenure analysis."] };
  }

  const tenures = emps.map((e) => tenureMonths(e, currentYear, currentMonth));
  const avg = Math.round(tenures.reduce((a, b) => a + b, 0) / tenures.length);
  const shortStints = tenures.filter((m) => m < 12).length;
  const currentlyEmployed = emps.some((e) => e.endYear === null);

  // Largest unexplained gap between consecutive roles.
  const sorted = [...emps].sort((a, b) => monthsAbs(a.startYear, a.startMonth) - monthsAbs(b.startYear, b.startMonth));
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].endYear !== null ? monthsAbs(sorted[i - 1].endYear!, sorted[i - 1].endMonth ?? 1) : monthsAbs(currentYear, currentMonth);
    const gap = monthsAbs(sorted[i].startYear, sorted[i].startMonth) - prevEnd;
    if (gap > maxGap) maxGap = gap;
  }

  const reasons: string[] = [];
  let score = 50;

  if (avg >= 48) { score += 35; reasons.push(`Long average tenure (~${(avg / 12).toFixed(1)}y per role).`); }
  else if (avg >= 36) { score += 28; reasons.push(`Strong average tenure (~${(avg / 12).toFixed(1)}y per role).`); }
  else if (avg >= 24) { score += 18; reasons.push(`Healthy average tenure (~${(avg / 12).toFixed(1)}y per role).`); }
  else if (avg >= 18) { score += 8; reasons.push(`Moderate average tenure (~${avg} months per role).`); }
  else if (avg >= 12) { reasons.push(`Average tenure ~${avg} months per role.`); }
  else { score -= 15; reasons.push(`Short average tenure (~${avg} months per role).`); }

  if (shortStints > 0) {
    const ratio = shortStints / emps.length;
    const penalty = Math.round(ratio * 30);
    score -= penalty;
    reasons.push(`${shortStints} of ${emps.length} roles under 1 year.`);
  }

  if (maxGap > 18) { score -= 20; reasons.push(`${maxGap}-month employment gap.`); }
  else if (maxGap > 6) { score -= 10; reasons.push(`${maxGap}-month employment gap.`); }

  if (currentlyEmployed) { score += 5; reasons.push("Currently employed."); }

  score = Math.max(0, Math.min(100, score));
  const band: StabilityBand = score >= 70 ? "stable" : score >= 45 ? "moderate" : "job_hopper";

  return { score, band, avgTenureMonths: avg, shortStints, roles: emps.length, reasons };
}

// ---------------------------------------------------------------------------
// Notable / recognised employers — a positive credibility signal.
// Curated, case-insensitive. Intentionally conservative (well-known global
// brands across tech, consulting, finance, and product) to avoid false positives.
// ---------------------------------------------------------------------------
const NOTABLE_EMPLOYERS: string[] = [
  // Big tech
  "Google", "Alphabet", "Meta", "Facebook", "Amazon", "AWS", "Apple", "Microsoft", "Netflix", "Nvidia",
  "Tesla", "IBM", "Oracle", "SAP", "Intel", "Adobe", "Salesforce", "Cisco", "Dell", "HP", "Samsung",
  // Product / unicorns
  "Uber", "Airbnb", "Spotify", "Stripe", "Shopify", "Booking.com", "Booking", "PayPal", "Block", "Square",
  "Atlassian", "Datadog", "Snowflake", "Databricks", "Twilio", "Cloudflare", "GitLab", "GitHub", "Dropbox",
  "Slack", "Zoom", "Revolut", "Wise", "Monzo", "Klarna", "Wix", "Monday.com", "JetBrains", "EPAM", "Grammarly",
  // Consulting / finance / enterprise
  "McKinsey", "Bain", "Boston Consulting Group", "Deloitte", "PwC", "PricewaterhouseCoopers", "KPMG", "Ernst & Young",
  "Accenture", "Goldman Sachs", "Morgan Stanley", "JPMorgan", "JP Morgan", "Barclays", "Visa", "Mastercard",
  // Marketing / media (relevant to non-tech roles)
  "Publicis", "Ogilvy", "WPP", "Dentsu", "TikTok", "ByteDance", "Snap", "Twitter", "LinkedIn",
];

export interface NotableEmployer {
  company: string; // as it appeared on the CV
  matched: string; // canonical notable name
}

/** Flag any employment at a recognised/large employer (positive signal). */
export function detectNotableEmployers(c: CandidateInput): NotableEmployer[] {
  const out: NotableEmployer[] = [];
  const seen = new Set<string>();
  for (const e of c.employments ?? []) {
    const company = (e.company ?? "").trim();
    if (!company) continue;
    const lc = company.toLowerCase();
    for (const n of NOTABLE_EMPLOYERS) {
      const nlc = n.toLowerCase();
      // Word-boundary-ish contains match (avoids matching "Apple" inside "Appleseed Ltd" only loosely).
      const re = new RegExp(`(^|[^a-z])${nlc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
      if (re.test(lc) && !seen.has(n)) {
        out.push({ company, matched: n });
        seen.add(n);
        break;
      }
    }
  }
  return out;
}
