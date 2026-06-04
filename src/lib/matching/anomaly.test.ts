import { describe, it, expect } from "vitest";
import { detectAnomalies, detectDuplicates } from "./anomaly";
import { CandidateInput } from "@/lib/types";

const CURRENT_YEAR = 2026;

function makeCandidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    id: "c1",
    fullName: "Test Candidate",
    title: "Full-Stack Developer",
    country: "Ukraine",
    location: "Kyiv",
    flag: "🇺🇦",
    englishLevel: "B2",
    totalYears: 6,
    careerStartYear: 2018,
    availability: "available",
    availabilityNote: "2 weeks",
    clientRate: 30,
    linkedinTitle: null,
    updatedAt: new Date("2026-05-01"),
    skills: [{ name: "React", years: 5 }],
    employments: [
      { company: "A", title: "Dev", fullTime: true, startYear: 2018, startMonth: 1, endYear: null, endMonth: null },
    ],
    ...overrides,
  };
}

describe("detectAnomalies", () => {
  it("flags impossible skill tenure (skill older than the tech)", () => {
    const c = makeCandidate({ skills: [{ name: "React", years: 15 }], careerStartYear: 2008 });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "skill_years > current_year - skill_release_year")).toBe(true);
  });

  it("flags skill years exceeding total career length", () => {
    const c = makeCandidate({
      careerStartYear: 2022, // 4y career
      skills: [{ name: "Node.js", years: 9 }],
    });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "skill_years > total_career_years")).toBe(true);
  });

  it("flags overlapping full-time employment", () => {
    const c = makeCandidate({
      employments: [
        { company: "Alpha", title: "Eng", fullTime: true, startYear: 2022, startMonth: 1, endYear: null, endMonth: null },
        { company: "Beta", title: "Eng", fullTime: true, startYear: 2021, startMonth: 6, endYear: 2023, endMonth: 1 },
      ],
    });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "overlapping full-time employment dates")).toBe(true);
  });

  it("does NOT flag overlap when one role is part-time", () => {
    const c = makeCandidate({
      employments: [
        { company: "Alpha", title: "Eng", fullTime: true, startYear: 2022, startMonth: 1, endYear: null, endMonth: null },
        { company: "Beta", title: "Advisor", fullTime: false, startYear: 2021, startMonth: 6, endYear: 2023, endMonth: 1 },
      ],
    });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "overlapping full-time employment dates")).toBe(false);
  });

  it("flags a senior/architect title inconsistent with ~1 year experience", () => {
    const c = makeCandidate({
      title: "Senior Software Architect",
      careerStartYear: 2025,
      totalYears: 1,
      skills: [{ name: "React", years: 1 }],
      employments: [
        { company: "X", title: "Junior Dev", fullTime: true, startYear: 2025, startMonth: 1, endYear: null, endMonth: null },
      ],
    });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "seniority title inconsistent with total experience")).toBe(true);
  });

  it("flags CV vs LinkedIn title conflict", () => {
    const c = makeCandidate({ title: "Senior Engineer", linkedinTitle: "Junior Developer" });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "CV vs LinkedIn title/date conflicts")).toBe(true);
  });

  it("flags an unexplained employment gap > 6 months", () => {
    const c = makeCandidate({
      employments: [
        { company: "New", title: "Dev", fullTime: true, startYear: 2022, startMonth: 3, endYear: null, endMonth: null },
        { company: "Old", title: "Dev", fullTime: true, startYear: 2018, startMonth: 6, endYear: 2021, endMonth: 1 },
      ],
    });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "unexplained employment gaps > 6 months")).toBe(true);
  });

  it("flags a suspicious employment pattern (many sub-1-year stints)", () => {
    const c = makeCandidate({
      careerStartYear: 2023,
      totalYears: 3,
      employments: [
        { company: "A", title: "Dev", fullTime: true, startYear: 2022, startMonth: 1, endYear: 2022, endMonth: 8 },
        { company: "B", title: "Dev", fullTime: true, startYear: 2022, startMonth: 9, endYear: 2023, endMonth: 3 },
        { company: "C", title: "Dev", fullTime: true, startYear: 2023, startMonth: 4, endYear: 2023, endMonth: 11 },
        { company: "D", title: "Dev", fullTime: true, startYear: 2024, startMonth: 1, endYear: 2024, endMonth: 7 },
      ],
    });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found.some((a) => a.rule === "suspicious employment pattern")).toBe(true);
  });

  it("returns no anomalies for a clean candidate", () => {
    const c = makeCandidate({
      title: "Senior Full-Stack Developer",
      careerStartYear: 2018,
      skills: [
        { name: "React", years: 6 },
        { name: "Node.js", years: 7 },
      ],
      employments: [
        { company: "A", title: "Senior Dev", fullTime: true, startYear: 2021, startMonth: 3, endYear: null, endMonth: null },
        { company: "B", title: "Dev", fullTime: true, startYear: 2018, startMonth: 6, endYear: 2021, endMonth: 2 },
      ],
    });
    const found = detectAnomalies(c, { currentYear: CURRENT_YEAR });
    expect(found).toHaveLength(0);
  });
});

describe("detectDuplicates", () => {
  it("flags two candidates sharing an email", () => {
    const a = makeCandidate({ id: "a", fullName: "Alex One", email: "dup@x.com" });
    const b = makeCandidate({ id: "b", fullName: "Alex Two", email: "DUP@x.com" });
    const c = makeCandidate({ id: "c", fullName: "Unique", email: "u@x.com" });
    const dupes = detectDuplicates([a, b, c]);
    expect(dupes.get("a")?.rule).toBe("duplicate candidate");
    expect(dupes.get("b")?.rule).toBe("duplicate candidate");
    expect(dupes.has("c")).toBe(false);
  });

  it("flags duplicates by normalized name + country when no email", () => {
    const a = makeCandidate({ id: "a", fullName: "Vasya  Petrov", country: "Ukraine", email: null });
    const b = makeCandidate({ id: "b", fullName: "vasya petrov", country: "ukraine", email: null });
    const dupes = detectDuplicates([a, b]);
    expect(dupes.get("a")?.severity).toBe("high");
    expect(dupes.get("b")?.severity).toBe("high");
  });
});
