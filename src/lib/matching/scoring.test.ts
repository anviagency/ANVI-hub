import { describe, it, expect } from "vitest";
import { analyzeCandidate, computeSkillCoverage } from "./scoring";
import { CandidateInput, JobRequirement } from "@/lib/types";

const CURRENT_YEAR = 2026;
const NOW = new Date("2026-06-04");

const JOB: JobRequirement = {
  title: "Senior Full-Stack Developer",
  seniority: "Senior",
  experienceYearsMin: 5,
  englishLevel: "B2+",
  budgetMax: 42,
  budgetUnit: "usd_hour",
  skills: [
    { name: "React", required: true, minYears: 4 },
    { name: "Next.js", required: true, minYears: 2 },
    { name: "Node.js", required: true, minYears: 3 },
    { name: "PostgreSQL", required: true, minYears: 2 },
    { name: "SaaS", required: false, minYears: null },
  ],
};

function strong(): CandidateInput {
  return {
    id: "strong",
    fullName: "Strong Fit",
    title: "Senior Full-Stack Developer",
    country: "Ukraine",
    location: "Kyiv",
    flag: "🇺🇦",
    englishLevel: "C1",
    totalYears: 7,
    careerStartYear: 2018,
    availability: "available",
    availabilityNote: "2 weeks",
    clientRate: 34,
    linkedinTitle: null,
    updatedAt: NOW,
    skills: [
      { name: "React", years: 6 },
      { name: "Next.js", years: 5 },
      { name: "Node.js", years: 7 },
      { name: "PostgreSQL", years: 5 },
      { name: "SaaS", years: 4 },
    ],
    employments: [
      { company: "A", title: "Senior Dev", fullTime: true, startYear: 2021, startMonth: 3, endYear: null, endMonth: null },
      { company: "B", title: "Dev", fullTime: true, startYear: 2018, startMonth: 6, endYear: 2021, endMonth: 2 },
    ],
  };
}

function weak(): CandidateInput {
  return {
    ...strong(),
    id: "weak",
    fullName: "Weak Fit",
    englishLevel: "B1",
    clientRate: 55, // over budget
    skills: [{ name: "React", years: 2 }], // missing most required, under years
    totalYears: 2,
    careerStartYear: 2024,
  };
}

describe("computeSkillCoverage", () => {
  it("counts required matches, under-years, and missing", () => {
    const cov = computeSkillCoverage(strong(), JOB);
    expect(cov.required).toBe(4);
    expect(cov.requiredMatched).toBeCloseTo(4, 5);
    expect(cov.missingRequired).toHaveLength(0);
    expect(cov.advantageMatched).toContain("SaaS");
  });

  it("detects missing required + under-years", () => {
    const cov = computeSkillCoverage(weak(), JOB);
    expect(cov.missingRequired).toContain("Node.js");
    expect(cov.requiredUnderYears).toContain("React"); // 2y < 4y required
  });
});

describe("analyzeCandidate", () => {
  it("scores a strong fit high and recommends strongly", () => {
    const r = analyzeCandidate({ candidate: strong(), job: JOB, anomalies: [], currentYear: CURRENT_YEAR, now: NOW });
    expect(r.matchScore).toBeGreaterThanOrEqual(80);
    expect(r.recommendation).toBe("strong");
    expect(r.strengths.length).toBeGreaterThan(0);
  });

  it("scores a weak fit low with concrete risks", () => {
    const r = analyzeCandidate({ candidate: weak(), job: JOB, anomalies: [], currentYear: CURRENT_YEAR, now: NOW });
    expect(r.matchScore).toBeLessThan(60);
    expect(r.recommendation).toBe("weak");
    const riskText = r.risks.map((x) => x.text.toLowerCase()).join(" ");
    expect(riskText).toContain("budget");
  });

  it("produces an explainable breakdown whose components sum to the score", () => {
    const r = analyzeCandidate({ candidate: strong(), job: JOB, anomalies: [], currentYear: CURRENT_YEAR, now: NOW });
    expect(r.scoreBreakdown.length).toBeGreaterThan(3);
    const labels = r.scoreBreakdown.map((b) => b.label);
    expect(labels).toContain("Skill coverage");
    expect(labels).toContain("Freshness");
    const sum = r.scoreBreakdown.reduce((acc, b) => acc + b.points, 0);
    // strong() is fresh + unclamped, so the components should reconstruct the score.
    expect(Math.abs(Math.round(sum) - r.matchScore)).toBeLessThanOrEqual(1);
  });

  it("attaches a freshness band to every result and penalizes stale data", () => {
    const fresh = analyzeCandidate({ candidate: strong(), job: JOB, anomalies: [], currentYear: CURRENT_YEAR, now: NOW });
    expect(fresh.freshness.band).toBe("green");
    const staleCand = { ...strong(), updatedAt: new Date("2024-01-01"), lastContactedAt: null };
    const stale = analyzeCandidate({ candidate: staleCand, job: JOB, anomalies: [], currentYear: CURRENT_YEAR, now: NOW });
    expect(stale.freshness.band).toBe("red");
    expect(stale.matchScore).toBeLessThan(fresh.matchScore);
  });

  it("applies a heavy penalty for high-severity anomalies", () => {
    const base = analyzeCandidate({ candidate: strong(), job: JOB, anomalies: [], currentYear: CURRENT_YEAR, now: NOW });
    const flagged = analyzeCandidate({
      candidate: strong(),
      job: JOB,
      anomalies: [{ text: "impossible tenure", rule: "x", severity: "high" }],
      currentYear: CURRENT_YEAR,
      now: NOW,
    });
    expect(flagged.matchScore).toBeLessThan(base.matchScore);
    expect(base.matchScore - flagged.matchScore).toBeGreaterThanOrEqual(15);
  });
});
