import { describe, it, expect } from "vitest";
import { parseCvDeterministic, detectName, isLikelyName } from "@/lib/ai/cv-parser";

describe("CV name detection — never use a job title as a name", () => {
  it("1. uses a real name when it is the first line", () => {
    const cv = `Olena Kovalenko
Senior React Developer
Skills: React, Node.js, TypeScript
7 years experience. English: C1. Ukraine.`;
    const r = parseCvDeterministic(cv);
    expect(r.fullName).toBe("Olena Kovalenko");
    expect(r.nameConfidence).toBe("high");
    expect(r.title).toMatch(/Developer/);
  });

  it("2. skips a job-title first line and takes the real name on line 2", () => {
    const cv = `Senior Software Engineer
Marko Petrov
React, Node.js, PostgreSQL
8 years. Serbia.`;
    const r = parseCvDeterministic(cv);
    expect(r.fullName).toBe("Marko Petrov");
    expect(r.nameConfidence).toBe("high");
  });

  it("3. derives a low-confidence name from the email when no clear name exists", () => {
    const cv = `Backend Developer
Contact: olena.kovalenko@gmail.com
React, Node.js, Python. 6 years.`;
    const r = parseCvDeterministic(cv);
    expect(r.fullName).toBe("Olena Kovalenko");
    expect(r.nameConfidence).toBe("low");
    expect(r.email).toBe("olena.kovalenko@gmail.com");
    expect(r.warnings).toContain("name_derived_from_email");
  });

  it("4. returns null (never invents a name) when only a title and no reliable name", () => {
    const cv = `Senior Software Engineer
Full Stack Developer
Skills: React, Node.js, TypeScript, PostgreSQL
10 years of experience.`;
    const r = parseCvDeterministic(cv);
    expect(r.fullName).toBeNull();
    expect(r.nameConfidence).toBe("none");
    expect(r.warnings).toContain("no_reliable_name");
  });

  it("6. the original bug: 'Senior Software Engineer' is never accepted as a name", () => {
    expect(isLikelyName("Senior Software Engineer")).toBe(false);
    expect(isLikelyName("Backend Developer")).toBe(false);
    expect(isLikelyName("Full Stack Engineer")).toBe(false);
    expect(isLikelyName("Media Buyer")).toBe(false);
    expect(isLikelyName("Affiliate Manager")).toBe(false);
    expect(isLikelyName("Skills")).toBe(false);
    expect(isLikelyName("Work Experience")).toBe(false);
  });

  it("accepts real names incl. ALL-CAPS (normalised to Title Case)", () => {
    expect(isLikelyName("Olena Kovalenko")).toBe(true);
    expect(isLikelyName("ARTEM KHRANOVSKYI")).toBe(true);
    expect(isLikelyName("Jean-Pierre Dubois")).toBe(true);
    expect(detectName("ARTEM KHRANOVSKYI\nDeveloper").name).toBe("Artem Khranovskyi");
  });

  it("ignores generic mailbox locals (info@, hr@) for the email fallback", () => {
    const r = detectName("Software Engineer\nhr@company.com\nReact");
    expect(r.name).toBeNull();
    expect(r.confidence).toBe("none");
  });
});
