import { describe, it, expect } from "vitest";
import { parseJobDeterministic } from "./job-parser";

describe("parseJobDeterministic", () => {
  it("parses the spec §2.2 example end-to-end", () => {
    const text = `Need Senior Python Developer
5+ years experience
React advantage
AWS
Fluent English
Budget 30$/hour`;
    const job = parseJobDeterministic(text);

    expect(job.isJob).toBe(true);
    expect(job.seniority).toBe("Senior");
    expect(job.title?.toLowerCase()).toContain("python");
    expect(job.experienceYearsMin).toBe(5);
    expect(job.englishLevel).toBe("Fluent");
    expect(job.budget).toEqual({ min: 30, max: 30, unit: "usd_hour" });

    const names = job.skills.map((s) => s.name);
    expect(names).toContain("Python");
    expect(names).toContain("AWS");
    expect(names).toContain("React");

    // "React advantage" => not required
    const react = job.skills.find((s) => s.name === "React");
    expect(react?.required).toBe(false);

    // client is always a missing field to resolve
    expect(job.missingFields).toContain("client");
  });

  it("parses an hourly budget range", () => {
    const job = parseJobDeterministic("Senior Full-Stack Developer, React, Node, $28-42/hr");
    expect(job.budget).toEqual({ min: 28, max: 42, unit: "usd_hour" });
  });

  it("captures per-skill minimum years", () => {
    const job = parseJobDeterministic("Backend engineer with Node.js and 6 years AWS, Python");
    const aws = job.skills.find((s) => s.name === "AWS");
    expect(aws?.minYears).toBe(6);
  });

  it("rejects non-job chatter", () => {
    const job = parseJobDeterministic("hey, how's the pipeline looking today?");
    expect(job.isJob).toBe(false);
  });

  it("synonym-maps JS/TS/Postgres to canonical names", () => {
    const job = parseJobDeterministic("Need a dev with JS, TS and postgres experience");
    const names = job.skills.map((s) => s.name);
    expect(names).toContain("JavaScript");
    expect(names).toContain("TypeScript");
    expect(names).toContain("PostgreSQL");
  });
});
