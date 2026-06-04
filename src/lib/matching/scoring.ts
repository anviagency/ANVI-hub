import {
  Anomaly,
  CandidateAnalysisResult,
  CandidateInput,
  JobRequirement,
  Risk,
  ScoreComponent,
  Strength,
} from "@/lib/types";
import { careerYears } from "@/lib/matching/anomaly";
import { scoreFreshness } from "@/lib/matching/freshness";

// Match scoring + strengths/risks generation (spec §3.3, §4.1, §4.2).
// Pure and deterministic — unit-testable without DB/network. When Claude is
// available the analysis route can rephrase the narrative, but the score and
// the evidence-backed facts are computed here so they are always trustworthy.

const ENGLISH_ORDER = ["A1", "A2", "B1", "B2", "B2+", "C1", "C2", "Conversational", "Fluent", "Native"];
function englishRank(level: string | null | undefined): number {
  if (!level) return -1;
  const norm = level.trim();
  // Map free-form to the closest band.
  if (/native|fluent|c2/i.test(norm)) return 9;
  if (/c1/i.test(norm)) return 6;
  if (/b2\+|upper/i.test(norm)) return 5;
  if (/b2/i.test(norm)) return 4;
  if (/conversational/i.test(norm)) return 3;
  if (/b1/i.test(norm)) return 2;
  const idx = ENGLISH_ORDER.findIndex((l) => l.toLowerCase() === norm.toLowerCase());
  return idx;
}

export interface SkillCoverage {
  required: number;
  requiredMatched: number;
  requiredUnderYears: string[];
  missingRequired: string[];
  advantageMatched: string[];
}

export function computeSkillCoverage(c: CandidateInput, job: JobRequirement): SkillCoverage {
  const have = new Map(c.skills.map((s) => [s.name.toLowerCase(), s.years]));
  const required = job.skills.filter((s) => s.required);
  const advantage = job.skills.filter((s) => !s.required);

  const missingRequired: string[] = [];
  const requiredUnderYears: string[] = [];
  let requiredMatched = 0;

  for (const s of required) {
    const years = have.get(s.name.toLowerCase());
    if (years === undefined) {
      missingRequired.push(s.name);
    } else if (s.minYears && years < s.minYears) {
      requiredUnderYears.push(s.name);
      requiredMatched += 0.6; // partial credit
    } else {
      requiredMatched += 1;
    }
  }

  const advantageMatched = advantage
    .filter((s) => have.has(s.name.toLowerCase()))
    .map((s) => s.name);

  return {
    required: required.length,
    requiredMatched,
    requiredUnderYears,
    missingRequired,
    advantageMatched,
  };
}

export interface ScoreInputs {
  candidate: CandidateInput;
  job: JobRequirement;
  anomalies: Anomaly[];
  currentYear: number;
  now?: Date;
}

export function analyzeCandidate(inputs: ScoreInputs): CandidateAnalysisResult {
  const { candidate: c, job, anomalies } = inputs;
  const now = inputs.now ?? new Date();
  const cov = computeSkillCoverage(c, job);

  // Every term records its signed contribution so the score is fully explainable.
  const breakdown: ScoreComponent[] = [];
  const add = (label: string, points: number, detail?: string) => {
    if (points === 0 && !detail) return;
    breakdown.push({ label, points: Math.round(points * 10) / 10, detail });
  };

  // --- Skill coverage (the dominant term) ---
  const skillRatio = cov.required > 0 ? cov.requiredMatched / cov.required : 0.5;
  let score = skillRatio * 62; // up to 62 pts
  add(
    "Skill coverage",
    skillRatio * 62,
    cov.required > 0
      ? `${Math.round(skillRatio * 100)}% of ${cov.required} required skills (${cov.requiredMatched.toFixed(1)} matched)`
      : "No required skills specified"
  );

  // Advantage skills: up to +10
  const advPts = Math.min(cov.advantageMatched.length * 4, 10);
  score += advPts;
  if (advPts) add("Advantage skills", advPts, cov.advantageMatched.join(", "));

  // --- Experience depth: up to ±12 ---
  const years = careerYears(c, inputs.currentYear);
  if (job.experienceYearsMin != null) {
    if (years >= job.experienceYearsMin) {
      score += 10;
      add("Experience depth", 10, `${Math.round(years)}y ≥ ${job.experienceYearsMin}y required`);
    } else {
      const pen = -Math.min((job.experienceYearsMin - years) * 4, 14);
      score += pen;
      add("Experience depth", pen, `${Math.round(years)}y < ${job.experienceYearsMin}y required`);
    }
  } else {
    const pts = Math.min(years, 6);
    score += pts;
    add("Seniority", pts, `${Math.round(years)}y career`);
  }

  // --- English fit: ±6 ---
  if (job.englishLevel) {
    const need = englishRank(job.englishLevel);
    const got = englishRank(c.englishLevel);
    if (got >= 0 && need >= 0) {
      if (got >= need) {
        score += 6;
        add("English fit", 6, `${c.englishLevel} ≥ ${job.englishLevel}`);
      } else {
        const pen = -(need - got) * 3;
        score += pen;
        add("English fit", pen, `${c.englishLevel ?? "?"} < ${job.englishLevel}`);
      }
    }
  }

  // --- Budget fit: ±8 ---
  if (job.budgetMax != null && c.clientRate != null) {
    if (c.clientRate <= job.budgetMax) {
      score += 6;
      add("Budget fit", 6, `$${c.clientRate}/hr ≤ $${job.budgetMax}/hr cap`);
    } else {
      const pen = -Math.min(((c.clientRate - job.budgetMax) / job.budgetMax) * 30, 12);
      score += pen;
      add("Budget fit", pen, `$${c.clientRate}/hr > $${job.budgetMax}/hr cap`);
    }
  }

  // --- Availability ---
  if (c.availability === "available") {
    score += 5;
    add("Availability", 5, "Available");
  } else if (c.availability === "placed") {
    score -= 20;
    add("Availability", -20, "Currently placed");
  }

  // --- Data freshness (mission Part 6) ---
  const freshness = scoreFreshness(c, now);
  score += freshness.rankingDelta;
  add("Freshness", freshness.rankingDelta, `${freshness.label} · updated ${freshness.daysSinceUpdated}d ago`);

  // --- Anomaly penalty ---
  let anomalyPenalty = 0;
  for (const a of anomalies) {
    anomalyPenalty -= a.severity === "high" ? 18 : a.severity === "med" ? 7 : 2;
  }
  if (anomalyPenalty) {
    score += anomalyPenalty;
    add("Anomaly penalty", anomalyPenalty, `${anomalies.length} anomaly flag${anomalies.length === 1 ? "" : "s"}`);
  }

  const matchScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    candidateId: c.id,
    matchScore,
    recommendation: matchScore >= 80 ? "strong" : matchScore >= 60 ? "possible" : "weak",
    strengths: buildStrengths(c, job, cov, years),
    risks: buildRisks(c, job, cov, now),
    anomalies,
    freshness,
    scoreBreakdown: breakdown,
  };
}

function buildStrengths(
  c: CandidateInput,
  job: JobRequirement,
  cov: SkillCoverage,
  years: number
): Strength[] {
  const out: Strength[] = [];

  if (cov.required > 0 && cov.requiredMatched >= cov.required - 0.01) {
    out.push({
      text: `Covers all ${cov.required} required skills`,
      evidence: job.skills.filter((s) => s.required).map((s) => s.name).join(", "),
    });
  } else if (cov.requiredMatched / Math.max(cov.required, 1) >= 0.7) {
    out.push({
      text: `Strong skill overlap (${Math.round((cov.requiredMatched / cov.required) * 100)}% of required)`,
      evidence: job.skills
        .filter((s) => s.required && !cov.missingRequired.includes(s.name))
        .map((s) => s.name)
        .join(", "),
    });
  }

  if (job.experienceYearsMin != null && years >= job.experienceYearsMin) {
    out.push({
      text: `${Math.round(years)} years experience — meets the ${job.experienceYearsMin}+ bar`,
      evidence: `Career start anchors ~${Math.round(years)} years`,
    });
  }

  if (cov.advantageMatched.length > 0) {
    out.push({
      text: `Brings ${cov.advantageMatched.length} nice-to-have skill${cov.advantageMatched.length > 1 ? "s" : ""}`,
      evidence: cov.advantageMatched.join(", "),
    });
  }

  if (englishRank(c.englishLevel) >= 6) {
    out.push({ text: `${c.englishLevel} English — client-facing ready`, evidence: "Language band" });
  }

  if (job.budgetMax != null && c.clientRate != null && c.clientRate <= job.budgetMax) {
    out.push({
      text: `Inside budget at $${c.clientRate}/hr`,
      evidence: `Client cap $${job.budgetMax}/hr`,
    });
  }

  // Stable tenure: avg years/role across completed roles.
  const completed = c.employments.filter((e) => e.endYear !== null);
  if (completed.length >= 2 && years > 0) {
    const avg = years / c.employments.length;
    if (avg >= 2.2) {
      out.push({
        text: `Stable employment history (avg ~${avg.toFixed(1)} yrs/role)`,
        evidence: `${c.employments.length} roles over ~${Math.round(years)} years`,
      });
    }
  }

  if (c.availability === "available") {
    out.push({
      text: `Available${c.availabilityNote ? ` — ${c.availabilityNote}` : ""}`,
      evidence: "Availability flag",
    });
  }

  return out;
}

function buildRisks(c: CandidateInput, job: JobRequirement, cov: SkillCoverage, now: Date): Risk[] {
  const out: Risk[] = [];

  for (const m of cov.missingRequired) {
    out.push({ text: `No evidence of required skill: ${m}`, severity: "high" });
  }
  for (const u of cov.requiredUnderYears) {
    out.push({ text: `Below required years on ${u}`, severity: "med" });
  }

  if (job.budgetMax != null && c.clientRate != null && c.clientRate > job.budgetMax) {
    out.push({
      text: `Rate above budget ($${c.clientRate} vs $${job.budgetMax})`,
      severity: "med",
    });
  }

  if (job.englishLevel) {
    const need = englishRank(job.englishLevel);
    const got = englishRank(c.englishLevel);
    if (got >= 0 && need >= 0 && got < need) {
      out.push({ text: `English ${c.englishLevel} below required ${job.englishLevel}`, severity: "med" });
    }
  }

  // Job hopping: many short stints.
  const shortStints = c.employments.filter(
    (e) => e.endYear !== null && e.endYear - e.startYear < 1
  ).length;
  if (shortStints >= 3) {
    out.push({ text: `Changed jobs frequently (${shortStints} roles under 1 year)`, severity: "med" });
  }

  if (c.availability === "placed") {
    out.push({ text: "Currently placed — not available", severity: "high" });
  } else if (c.availability === "on_hold") {
    out.push({ text: "On hold — confirm availability", severity: "low" });
  }

  const daysSinceUpdate = (now.getTime() - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > 365) {
    out.push({
      text: `Profile last updated ${Math.round(daysSinceUpdate / 30)} months ago — verify currency`,
      severity: "low",
    });
  }

  return out;
}
