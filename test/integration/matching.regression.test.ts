import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadJobRow } from "@/lib/jobs";
import { runMatch } from "@/lib/matching/funnel";
import { makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// Matching regression: locks the funnel's behaviour on a controlled fixture so
// future changes can't silently break ranking, anomaly flagging, or filtering.
const P = "ZZMATCH";
let jobId = "";

describe("matching funnel regression (DB)", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    jobId = await makeJob({
      prefix: P,
      budgetMax: 42,
      experienceYearsMin: 5,
      skills: [
        { name: "React", required: true, minYears: 4 },
        { name: "Node.js", required: true, minYears: 3 },
        { name: "PostgreSQL", required: true, minYears: 2 },
      ],
    });

    // Clean strong fit.
    await makeCandidate({
      prefix: P,
      name: "Clean",
      clientRate: 34,
      careerStartYear: 2017,
      skills: [
        { name: "React", years: 6 },
        { name: "Node.js", years: 7 },
        { name: "PostgreSQL", years: 5 },
      ],
      employments: [{ company: "A", start: [2019, 1] }],
    });

    // Anomaly: impossible React tenure (React released 2013; 15y > 13y by 2026).
    await makeCandidate({
      prefix: P,
      name: "Anomaly",
      clientRate: 30,
      careerStartYear: 2017,
      skills: [
        { name: "React", years: 15 },
        { name: "Node.js", years: 9 },
        { name: "PostgreSQL", years: 4 },
      ],
      employments: [{ company: "B", start: [2017, 1] }],
    });

    // Placed candidate — must be excluded by Stage 1.
    await makeCandidate({
      prefix: P,
      name: "Placed",
      availability: "placed",
      clientRate: 30,
      skills: [
        { name: "React", years: 6 },
        { name: "Node.js", years: 6 },
        { name: "PostgreSQL", years: 5 },
      ],
    });
  });
  afterAll(() => cleanupByPrefix(P));

  it("ranks the clean fit first and pushes the anomaly candidate down", async () => {
    const job = await loadJobRow(jobId);
    const results = await runMatch(job!, { limit: 20, currentYear: 2026 });
    const ours = results.filter((r) => r.candidate.fullName.startsWith(P));

    const clean = ours.find((r) => r.candidate.fullName.endsWith("Clean"))!;
    const anomaly = ours.find((r) => r.candidate.fullName.endsWith("Anomaly"))!;
    expect(clean).toBeTruthy();
    expect(anomaly).toBeTruthy();
    expect(clean.matchScore).toBeGreaterThan(anomaly.matchScore);
    expect(clean.recommendation).toBe("strong");
  });

  it("flags the anomaly candidate with the impossible-tenure rule", async () => {
    const job = await loadJobRow(jobId);
    const results = await runMatch(job!, { limit: 20, currentYear: 2026 });
    const anomaly = results.find((r) => r.candidate.fullName === `${P} Anomaly`)!;
    expect(anomaly.anomalies.length).toBeGreaterThan(0);
    expect(anomaly.anomalies.some((a) => a.rule.includes("skill_release_year"))).toBe(true);
  });

  it("excludes placed candidates at Stage 1", async () => {
    const job = await loadJobRow(jobId);
    const results = await runMatch(job!, { limit: 20, currentYear: 2026 });
    expect(results.some((r) => r.candidate.fullName === `${P} Placed`)).toBe(false);
  });
});
