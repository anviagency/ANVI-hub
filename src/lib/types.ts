// Shared domain types for the ANVI Recruiter Copilot slice.
// These are framework-agnostic plain objects so the matching/anomaly/scoring
// engines can be unit-tested without a database.
import type { AvailabilityResult } from "@/lib/matching/availability";
export type { AvailabilityResult } from "@/lib/matching/availability";

export interface ParsedSkill {
  name: string;
  required: boolean;
  minYears: number | null;
}

export interface ParsedJob {
  isJob: boolean;
  title: string | null;
  seniority: string | null;
  skills: ParsedSkill[];
  experienceYearsMin: number | null;
  englishLevel: string | null;
  budget: { min: number | null; max: number | null; unit: string | null };
  missingFields: string[];
  source: "llm" | "deterministic";
}

export type Intent =
  | "create_job"
  | "attach_client"
  | "match_candidates"
  | "search_candidates"
  | "client_package"
  | "compare"
  | "find_similar"
  | "availability"
  | "submit"
  | "share"
  | "explain"
  | "summarize"
  | "followup"
  | "status"
  | "smalltalk";

export interface RoutedIntent {
  intent: Intent;
  entities: Record<string, unknown>;
  source: "llm" | "deterministic";
}

// ---- Candidate shape consumed by the matching/anomaly engines ----
export interface EmploymentRecord {
  company: string;
  title: string | null;
  fullTime: boolean;
  startYear: number;
  startMonth: number; // 1-12
  endYear: number | null; // null = current
  endMonth: number | null;
}

export interface CandidateSkillInput {
  name: string; // canonical
  years: number;
}

export interface CandidateInput {
  id: string;
  fullName: string;
  title: string | null;
  country: string | null;
  location: string | null;
  flag: string | null;
  englishLevel: string | null; // e.g. "B2", "C1"
  totalYears: number | null;
  careerStartYear: number | null;
  availability: "available" | "on_hold" | "placed";
  availabilityNote: string | null;
  clientRate: number | null;
  linkedinTitle: string | null;
  email?: string | null;
  updatedAt: Date;
  lastContactedAt?: Date | null;
  lastScreenedAt?: Date | null;
  availabilityConfirmedAt?: Date | null;
  skills: CandidateSkillInput[];
  employments: EmploymentRecord[];
}

export interface JobRequirement {
  title: string;
  seniority: string | null;
  experienceYearsMin: number | null;
  englishLevel: string | null;
  budgetMax: number | null;
  budgetUnit: string | null;
  skills: { name: string; required: boolean; minYears: number | null }[];
}

// ---- Intelligence outputs ----
export type Severity = "low" | "med" | "high";

export interface Strength {
  text: string;
  evidence: string;
}
export interface Risk {
  text: string;
  severity: Severity;
}
export interface Anomaly {
  text: string;
  rule: string;
  severity: Severity;
}

export interface ScoreComponent {
  label: string;
  points: number; // signed contribution to the 0-100 score
  detail?: string;
}

export type FreshnessBand = "green" | "yellow" | "amber" | "red";

export interface FreshnessResult {
  band: FreshnessBand;
  score: number; // 0-100 (100 = touched today)
  daysSinceUpdated: number;
  daysSinceContacted: number | null;
  daysSinceScreened: number | null;
  rankingDelta: number; // signed contribution to match score
  label: string;
}

export interface CandidateAnalysisResult {
  candidateId: string;
  matchScore: number; // 0-100
  recommendation: "strong" | "possible" | "weak";
  strengths: Strength[];
  risks: Risk[];
  anomalies: Anomaly[];
  freshness: FreshnessResult;
  availability: AvailabilityResult;
  scoreBreakdown: ScoreComponent[];
  // Mission 10 Phase 3 — enriched (optional; populated by the matching pipeline).
  retentionProbability?: number | null;
  approvalProbability?: number | null;
  fitBreakdown?: {
    technical: number | null; industry: number | null; culture: number | null;
    leadership: number | null; communication: number | null; availability: number | null; budget: number | null;
  } | null;
  reasoning?: string | null;
  engineSource?: "deterministic" | "ai" | "hybrid";
}
