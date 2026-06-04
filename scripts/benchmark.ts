/**
 * Matching benchmark (mission Part 2 + Part 3).
 * Seeds a labeled dataset, runs all 4 scenarios through the real two-stage
 * funnel, and measures: funnel reduction, runtime, and accuracy (precision@5 /
 * recall / anomaly detection) against ground-truth labels. Writes reports/benchmark.md.
 *
 * Run: npx tsx scripts/benchmark.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { SCENARIOS, BENCH_CANDIDATES, BenchScenario, ScenarioKey } from "../src/lib/benchmark/dataset";
import { toCandidateInput, toJobRequirement, stage2Analyze } from "../src/lib/matching/funnel";
import { detectAnomalies, detectDuplicates } from "../src/lib/matching/anomaly";

const prisma = new PrismaClient();
const PREFIX = "BENCH ";
const CURRENT_YEAR = 2026;
const NOW = new Date("2026-06-04T00:00:00Z");
const SHORTLIST_K = 5;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86400000);
}
function ym(y: number, m: number): Date {
  return new Date(Date.UTC(y, m - 1, 1));
}

async function ensureSkill(name: string): Promise<string> {
  const s = await prisma.skill.upsert({ where: { canonicalName: name }, create: { canonicalName: name, synonyms: [] }, update: {} });
  return s.id;
}

async function cleanup() {
  await prisma.shareLink.deleteMany({ where: { job: { title: { startsWith: PREFIX } } } });
  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
  await prisma.job.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.client.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

async function seed() {
  const client = await prisma.client.create({ data: { name: `${PREFIX}Client`, portalSlug: `bench-${Date.now()}` } });
  const jobIds = new Map<ScenarioKey, string>();
  for (const sc of SCENARIOS) {
    const skillRows = [];
    for (const sk of sc.skills) skillRows.push({ skillId: await ensureSkill(sk.name), required: sk.required, minYears: sk.minYears ?? null });
    const job = await prisma.job.create({
      data: {
        clientId: client.id,
        title: `${PREFIX}${sc.title}`,
        seniority: "Senior",
        budgetMax: sc.budgetMax,
        budgetUnit: "usd_hour",
        experienceYearsMin: sc.experienceYearsMin,
        englishLevel: sc.englishLevel,
        skills: { create: skillRows },
      },
    });
    jobIds.set(sc.key, job.id);
  }
  for (const c of BENCH_CANDIDATES) {
    const skillRows = [];
    for (const sk of c.skills) skillRows.push({ skillId: await ensureSkill(sk.name), years: sk.years });
    await prisma.candidate.create({
      data: {
        fullName: `${PREFIX}${c.name}`,
        // Distinct storage key per row — duplicates exist precisely because they
        // entered under different keys; the engine detects them on the email field.
        dedupeKey: `bench:${c.key}`,
        title: c.title ?? "Engineer",
        country: c.country,
        englishLevel: c.englishLevel,
        availability: c.availability ?? "available",
        clientRate: c.clientRate,
        salaryExpectation: Math.round(c.clientRate * 0.7),
        careerStartYear: c.careerStartYear,
        totalYears: c.totalYears,
        email: c.email ?? null,
        linkedinTitle: c.linkedinTitle ?? null,
        updatedAt: daysAgo(c.updatedDaysAgo),
        lastContactedAt: c.contactedDaysAgo != null ? daysAgo(c.contactedDaysAgo) : null,
        skills: { create: skillRows },
        employments: c.employments
          ? { create: c.employments.map((e) => ({ company: e.company, fullTime: e.fullTime ?? true, startDate: ym(e.start[0], e.start[1]), endDate: e.end ? ym(e.end[0], e.end[1]) : null })) }
          : undefined,
      },
    });
  }
  return jobIds;
}

interface ScenarioResult {
  key: ScenarioKey;
  title: string;
  initial: number;
  afterStage1: number;
  afterStage2: number;
  shortlist: { key: string; name: string; score: number; positive: boolean; anomalies: number }[];
  positives: number;
  recall: number;
  precisionAt5: number;
  topIsPositive: boolean;
  stage1Ms: number;
  stage2Ms: number;
}

const keyOf = (fullName: string) => BENCH_CANDIDATES.find((c) => `${PREFIX}${c.name}` === fullName)?.key ?? "?";

async function runScenario(sc: BenchScenario, jobId: string): Promise<ScenarioResult> {
  const jobRow = {
    id: jobId,
    title: sc.title,
    seniority: "Senior",
    experienceYearsMin: sc.experienceYearsMin,
    englishLevel: sc.englishLevel,
    budgetMax: sc.budgetMax,
    budgetUnit: "usd_hour",
    skills: sc.skills.map((s) => ({ name: s.name, required: s.required, minYears: s.minYears ?? null })),
  };

  // Pull the controlled benchmark pool only.
  const rows = await prisma.candidate.findMany({
    where: { fullName: { startsWith: PREFIX } },
    include: { skills: { include: { skill: true } }, employments: true },
  });
  const initial = rows.length;

  // --- Stage 1: fast filter (same rules as funnel.stage1Filter) ---
  const anyNames = sc.skills.map((s) => s.name);
  const reqNames = sc.skills.filter((s) => s.required).map((s) => s.name);
  const t1 = performance.now();
  const survivors = rows.filter((r) => {
    if (r.availability === "placed") return false;
    const names = r.skills.map((s) => s.skill.canonicalName);
    if (!names.some((n) => anyNames.includes(n))) return false;
    if (reqNames.length > 0 && !names.some((n) => reqNames.includes(n))) return false;
    return true;
  });
  const stage1Ms = performance.now() - t1;

  // --- Stage 2: deep analysis ---
  const inputs = survivors.map(toCandidateInput);
  const t2 = performance.now();
  const analyzed = stage2Analyze(inputs, toJobRequirement(jobRow), { currentYear: CURRENT_YEAR, now: NOW });
  const stage2Ms = performance.now() - t2;

  const ranked = analyzed.filter((a) => a.matchScore >= 1).sort((a, b) => b.matchScore - a.matchScore);
  const shortlist = ranked.slice(0, SHORTLIST_K).map((r) => {
    const key = keyOf(r.candidate.fullName);
    const def = BENCH_CANDIDATES.find((c) => c.key === key);
    return { key, name: r.candidate.fullName.replace(PREFIX, ""), score: r.matchScore, positive: !!def?.matches.includes(sc.key), anomalies: r.anomalies.length };
  });

  const positivesAll = BENCH_CANDIDATES.filter((c) => c.matches.includes(sc.key));
  const foundPositives = shortlist.filter((s) => s.positive).length;
  const recall = positivesAll.length ? foundPositives / positivesAll.length : 0;
  const precisionAt5 = shortlist.length ? shortlist.filter((s) => s.positive).length / Math.min(SHORTLIST_K, shortlist.length) : 0;

  return {
    key: sc.key,
    title: sc.title,
    initial,
    afterStage1: survivors.length,
    afterStage2: ranked.length,
    shortlist,
    positives: positivesAll.length,
    recall,
    precisionAt5,
    topIsPositive: shortlist[0]?.positive ?? false,
    stage1Ms,
    stage2Ms,
  };
}

interface AnomalyAudit {
  plantedTotal: number;
  plantedCaught: number;
  falsePositives: number;
  details: { key: string; name: string; planted: string; caught: boolean; rules: string[] }[];
}

async function auditAnomalies(): Promise<AnomalyAudit> {
  const rows = await prisma.candidate.findMany({
    where: { fullName: { startsWith: PREFIX } },
    include: { skills: { include: { skill: true } }, employments: true },
  });
  const inputs = rows.map(toCandidateInput);
  const dupes = detectDuplicates(inputs);

  const details: AnomalyAudit["details"] = [];
  let falsePositives = 0;
  const FLAGGABLE = new Set(["impossible_tenure", "overlap", "title_vs_experience", "duplicate"]);

  for (const input of inputs) {
    const key = keyOf(input.fullName);
    const def = BENCH_CANDIDATES.find((c) => c.key === key);
    const anomalies = detectAnomalies(input, { currentYear: CURRENT_YEAR });
    const dup = dupes.get(input.id);
    if (dup) anomalies.push(dup);
    const caught = anomalies.length > 0;
    const planted = def?.planted;

    if (planted && FLAGGABLE.has(planted)) {
      details.push({ key, name: input.fullName.replace(PREFIX, ""), planted, caught, rules: anomalies.map((a) => a.rule) });
    } else if (caught) {
      // Anomaly fired on a candidate with no flaggable planted anomaly = false positive.
      falsePositives++;
    }
  }

  return {
    plantedTotal: details.length,
    plantedCaught: details.filter((d) => d.caught).length,
    falsePositives,
    details,
  };
}

/** In-memory scaling micro-benchmark: how fast is Stage-2 analysis per candidate? */
function scalingBenchmark(n: number) {
  const base = toCandidateInput0();
  const pool = Array.from({ length: n }, (_, i) => ({ ...base, id: `s${i}`, fullName: `Synthetic ${i}` }));
  const job = toJobRequirement({
    id: "x", title: "x", seniority: "Senior", experienceYearsMin: 5, englishLevel: "B2+", budgetMax: 45, budgetUnit: "usd_hour",
    skills: [
      { name: "React", required: true, minYears: 4 },
      { name: "Node.js", required: true, minYears: 3 },
      { name: "PostgreSQL", required: true, minYears: 2 },
    ],
  });
  const t = performance.now();
  stage2Analyze(pool, job, { currentYear: CURRENT_YEAR, now: NOW });
  const ms = performance.now() - t;
  return { n, ms, perCandidateUs: (ms / n) * 1000, ratePerSec: Math.round(n / (ms / 1000)) };
}

function toCandidateInput0() {
  return {
    id: "s0", fullName: "Synthetic", title: "Full-Stack Developer", country: "Ukraine", location: "Kyiv", flag: "🇺🇦",
    englishLevel: "B2+", totalYears: 7, careerStartYear: 2018, availability: "available" as const, availabilityNote: null,
    clientRate: 34, linkedinTitle: null, email: null, updatedAt: daysAgo(5), lastContactedAt: daysAgo(3), lastScreenedAt: null,
    skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 7 }, { name: "PostgreSQL", years: 5 }],
    employments: [{ company: "A", title: "Dev", fullTime: true, startYear: 2018, startMonth: 1, endYear: null, endMonth: null }],
  };
}

function bar(n: number, max: number, width = 20): string {
  const filled = Math.round((n / max) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

async function main() {
  console.log("⏳ Benchmark: seeding labeled dataset…");
  await cleanup();
  const jobIds = await seed();

  const results: ScenarioResult[] = [];
  for (const sc of SCENARIOS) {
    results.push(await runScenario(sc, jobIds.get(sc.key)!));
  }
  const anomalyAudit = await auditAnomalies();
  const scale = [1000, 10000, 50000].map(scalingBenchmark);

  // Placed-exclusion check.
  const placedExcluded = results.every((r) => !r.shortlist.some((s) => s.key === "PL1"));

  // ---- Console summary ----
  console.log("\n=== MATCHING FUNNEL ===");
  for (const r of results) {
    console.log(`\nScenario ${r.key}: ${r.title}`);
    console.log(`  initial   ${String(r.initial).padStart(3)}  ${bar(r.initial, r.initial)}`);
    console.log(`  stage 1   ${String(r.afterStage1).padStart(3)}  ${bar(r.afterStage1, r.initial)}  (skills+availability filter, ${r.stage1Ms.toFixed(2)}ms)`);
    console.log(`  stage 2   ${String(r.afterStage2).padStart(3)}  ${bar(r.afterStage2, r.initial)}  (deep analysis, ${r.stage2Ms.toFixed(2)}ms)`);
    console.log(`  shortlist ${String(r.shortlist.length).padStart(3)}  ${bar(r.shortlist.length, r.initial)}`);
    console.log(`  recall ${(r.recall * 100).toFixed(0)}% · precision@5 ${(r.precisionAt5 * 100).toFixed(0)}% · top-1 correct: ${r.topIsPositive}`);
    r.shortlist.forEach((s, i) => console.log(`    ${i + 1}. ${String(s.score).padStart(3)}  ${s.name}${s.positive ? " ✓" : " ✗"}${s.anomalies ? `  🔴x${s.anomalies}` : ""}`));
  }
  console.log("\n=== ANOMALY DETECTION ===");
  console.log(`  planted ${anomalyAudit.plantedCaught}/${anomalyAudit.plantedTotal} caught · false positives: ${anomalyAudit.falsePositives}`);
  anomalyAudit.details.forEach((d) => console.log(`    ${d.caught ? "✓" : "✗"} ${d.name} (${d.planted}) → ${d.rules.join("; ") || "—"}`));
  console.log(`  placed candidate excluded from all shortlists: ${placedExcluded}`);
  console.log("\n=== SCALING (in-memory Stage 2) ===");
  scale.forEach((s) => console.log(`  ${String(s.n).padStart(6)} cands → ${s.ms.toFixed(1)}ms (${s.perCandidateUs.toFixed(1)}µs/cand, ${s.ratePerSec.toLocaleString()}/s)`));

  // ---- Markdown report ----
  const macroRecall = results.reduce((a, r) => a + r.recall, 0) / results.length;
  const macroPrec = results.reduce((a, r) => a + r.precisionAt5, 0) / results.length;
  const md = renderReport(results, anomalyAudit, scale, placedExcluded, macroRecall, macroPrec);
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/benchmark.md", md);
  console.log("\n📝 Wrote reports/benchmark.md");

  await cleanup();
  await prisma.$disconnect();
}

function renderReport(
  results: ScenarioResult[],
  a: AnomalyAudit,
  scale: { n: number; ms: number; perCandidateUs: number; ratePerSec: number }[],
  placedExcluded: boolean,
  macroRecall: number,
  macroPrec: number
): string {
  const L: string[] = [];
  L.push("# ANVI Matching Benchmark", "");
  L.push(`_Generated by \`scripts/benchmark.ts\` against the real two-stage funnel on a labeled dataset of ${BENCH_CANDIDATES.length} candidates. Reference date 2026-06-04._`, "");
  L.push("## Summary", "");
  L.push(`- **Macro recall (positives in top ${SHORTLIST_K}):** ${(macroRecall * 100).toFixed(0)}%`);
  L.push(`- **Macro precision@${SHORTLIST_K}:** ${(macroPrec * 100).toFixed(0)}%`);
  L.push(`- **Anomalies caught:** ${a.plantedCaught}/${a.plantedTotal} · **false positives:** ${a.falsePositives}`);
  L.push(`- **Placed candidate excluded everywhere:** ${placedExcluded ? "yes" : "NO ❌"}`);
  L.push(`- **AI cost for matching:** $0.00 (deterministic engine — no LLM calls in the funnel)`, "");

  L.push("## Funnel per scenario", "");
  L.push("| Scenario | Initial | Stage 1 | Stage 2 | Shortlist | Recall | Precision@5 | Top-1 | Runtime |");
  L.push("|---|--:|--:|--:|--:|--:|--:|:--:|--:|");
  for (const r of results) {
    L.push(
      `| ${r.key} · ${r.title} | ${r.initial} | ${r.afterStage1} | ${r.afterStage2} | ${r.shortlist.length} | ${(r.recall * 100).toFixed(0)}% | ${(r.precisionAt5 * 100).toFixed(0)}% | ${r.topIsPositive ? "✓" : "✗"} | ${(r.stage1Ms + r.stage2Ms).toFixed(2)}ms |`
    );
  }
  L.push("");
  for (const r of results) {
    L.push(`### ${r.key} · ${r.title}`, "");
    L.push("| # | Score | Candidate | True match | Flags |", "|--:|--:|---|:--:|---|");
    r.shortlist.forEach((s, i) => L.push(`| ${i + 1} | ${s.score} | ${s.name} | ${s.positive ? "✓" : "✗"} | ${s.anomalies ? `🔴 ${s.anomalies}` : ""} |`));
    L.push("");
  }

  L.push("## Anomaly detection audit", "");
  L.push("| Candidate | Planted | Caught | Rules fired |", "|---|---|:--:|---|");
  a.details.forEach((d) => L.push(`| ${d.name} | ${d.planted} | ${d.caught ? "✓" : "✗"} | ${d.rules.join("; ") || "—"} |`));
  L.push("", `False positives on clean candidates: **${a.falsePositives}**`, "");

  L.push("## Scaling (in-memory Stage-2 analysis throughput)", "");
  L.push("| Candidates | Wall time | Per candidate | Throughput |", "|--:|--:|--:|--:|");
  scale.forEach((s) => L.push(`| ${s.n.toLocaleString()} | ${s.ms.toFixed(1)}ms | ${s.perCandidateUs.toFixed(1)}µs | ${s.ratePerSec.toLocaleString()}/s |`));
  L.push("", "> Stage 1 is an indexed SQL filter (not benchmarked here at 100k scale — see CTO audit for the scaling caveat). Stage 2 is pure CPU and embarrassingly parallel.", "");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
