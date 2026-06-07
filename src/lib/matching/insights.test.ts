import { describe, it, expect } from "vitest";
import { scoreStability, detectNotableEmployers } from "./insights";
import type { CandidateInput, EmploymentRecord } from "@/lib/types";

function emp(company: string, startYear: number, startMonth: number, endYear: number | null, endMonth: number | null): EmploymentRecord {
  return { company, title: null, fullTime: true, startYear, startMonth, endYear, endMonth };
}

function cand(employments: EmploymentRecord[], over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    id: "c1",
    fullName: "Test Person",
    title: null,
    country: null,
    location: null,
    flag: null,
    englishLevel: null,
    totalYears: null,
    careerStartYear: null,
    availability: "available",
    availabilityNote: null,
    clientRate: null,
    linkedinTitle: null,
    updatedAt: new Date(),
    employments,
    skills: [],
    ...over,
  } as CandidateInput;
}

const YEAR = 2026;

describe("scoreStability", () => {
  it("returns 'insufficient' with no employment history", () => {
    const r = scoreStability(cand([]), YEAR);
    expect(r.band).toBe("insufficient");
    expect(r.score).toBeNull();
  });

  it("rates long-tenured candidates as stable", () => {
    // Two ~4-year roles, currently employed.
    const r = scoreStability(cand([emp("A Corp", 2018, 1, 2022, 1), emp("B Corp", 2022, 2, null, null)]), YEAR);
    expect(r.band).toBe("stable");
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.shortStints).toBe(0);
  });

  it("flags frequent job changes as a job_hopper", () => {
    // Five sub-year stints.
    const r = scoreStability(
      cand([
        emp("A", 2022, 1, 2022, 8),
        emp("B", 2022, 9, 2023, 3),
        emp("C", 2023, 4, 2023, 10),
        emp("D", 2023, 11, 2024, 5),
        emp("E", 2024, 6, 2024, 11),
      ]),
      YEAR
    );
    expect(r.band).toBe("job_hopper");
    expect(r.score).toBeLessThan(45);
    expect(r.shortStints).toBe(5);
  });

  it("penalizes a large unexplained gap", () => {
    const noGap = scoreStability(cand([emp("A", 2018, 1, 2021, 1), emp("B", 2021, 2, null, null)]), YEAR).score!;
    const withGap = scoreStability(cand([emp("A", 2018, 1, 2021, 1), emp("B", 2023, 6, null, null)]), YEAR).score!;
    expect(withGap).toBeLessThan(noGap);
  });
});

describe("detectNotableEmployers", () => {
  it("recognises well-known employers", () => {
    const r = detectNotableEmployers(cand([emp("Google LLC", 2019, 1, 2023, 1), emp("Tiny Startup Ltd", 2023, 2, null, null)]));
    expect(r.map((e) => e.matched)).toContain("Google");
    expect(r.length).toBe(1);
  });

  it("does not false-positive on unrelated companies", () => {
    const r = detectNotableEmployers(cand([emp("Appleseed Farms", 2020, 1, null, null), emp("Metalworks Co", 2018, 1, 2019, 12)]));
    expect(r.length).toBe(0);
  });

  it("returns empty with no employment history", () => {
    expect(detectNotableEmployers(cand([]))).toEqual([]);
  });
});
