/**
 * Intelligence Integrity Validation (Mission 3.5 P2).
 * Proves, with observable output:
 *   A. Every anomaly rule fires (no silently-dead rule).
 *   B. The anomaly engine runs on REAL imported candidates, and the
 *      careerStartYear fallback makes tenure/title rules fire on import data.
 *   C. The candidate_analysis cache is actually read AND invalidated.
 * Writes reports/intelligence-validation.md. Run: npm run validate-intelligence
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { CandidateInput } from "../src/lib/types";
import { detectAnomalies, detectDuplicates } from "../src/lib/matching/anomaly";
import { ingestRows } from "../src/lib/import/ingest";
import { toCandidateInput, runMatch, persistAnalyses } from "../src/lib/matching/funnel";
import { loadJobRow } from "../src/lib/jobs";
import { getFreshAnalysis } from "../src/lib/matching/cache";

const prisma = new PrismaClient();
const PREFIX = "IVAL ";
const CURRENT_YEAR = 2026;
const NOW = new Date("2026-06-04T00:00:00Z");

function baseCand(over: Partial<CandidateInput>): CandidateInput {
  return {
    id: "x", fullName: "Test", title: "Developer", country: "Ukraine", location: "Kyiv", flag: "🇺🇦",
    englishLevel: "B2", totalYears: 7, careerStartYear: 2018, availability: "available", availabilityNote: null,
    clientRate: 30, linkedinTitle: null, email: null, updatedAt: NOW, lastContactedAt: null, lastScreenedAt: null,
    skills: [{ name: "React", years: 5 }], employments: [], ...over,
  };
}

const out: string[] = [];
const say = (s = "") => { console.log(s); out.push(s); };

function ruleCoverage() {
  say("## A. Anomaly rule coverage — every rule produces output\n");
  say("| Rule | Fired | Sample |");
  say("|---|:--:|---|");

  const cases: { rule: string; cand: CandidateInput }[] = [
    { rule: "skill_years > current_year - skill_release_year", cand: baseCand({ skills: [{ name: "React", years: 16 }], careerStartYear: 2008 }) },
    { rule: "skill_years > total_career_years", cand: baseCand({ careerStartYear: 2022, skills: [{ name: "Node.js", years: 9 }] }) },
    { rule: "overlapping full-time employment dates", cand: baseCand({ employments: [
      { company: "A", title: "Eng", fullTime: true, startYear: 2022, startMonth: 1, endYear: null, endMonth: null },
      { company: "B", title: "Eng", fullTime: true, startYear: 2021, startMonth: 6, endYear: 2023, endMonth: 1 }] }) },
    { rule: "seniority title inconsistent with total experience", cand: baseCand({ title: "Senior Software Architect", careerStartYear: 2025, totalYears: 1, skills: [{ name: "React", years: 1 }] }) },
    { rule: "CV vs LinkedIn title/date conflicts", cand: baseCand({ title: "Senior Engineer", linkedinTitle: "Junior Developer" }) },
    { rule: "unexplained employment gaps > 6 months", cand: baseCand({ employments: [
      { company: "New", title: "Dev", fullTime: true, startYear: 2022, startMonth: 3, endYear: null, endMonth: null },
      { company: "Old", title: "Dev", fullTime: true, startYear: 2018, startMonth: 6, endYear: 2021, endMonth: 1 }] }) },
    { rule: "suspicious employment pattern", cand: baseCand({ careerStartYear: 2023, totalYears: 3, employments: [
      { company: "A", title: "D", fullTime: true, startYear: 2022, startMonth: 1, endYear: 2022, endMonth: 8 },
      { company: "B", title: "D", fullTime: true, startYear: 2022, startMonth: 9, endYear: 2023, endMonth: 3 },
      { company: "C", title: "D", fullTime: true, startYear: 2023, startMonth: 4, endYear: 2023, endMonth: 11 },
      { company: "D", title: "D", fullTime: true, startYear: 2024, startMonth: 1, endYear: 2024, endMonth: 7 }] }) },
  ];

  let allFired = true;
  for (const c of cases) {
    const found = detectAnomalies(c.cand, { currentYear: CURRENT_YEAR });
    const hit = found.find((a) => a.rule === c.rule);
    if (!hit) allFired = false;
    say(`| \`${c.rule}\` | ${hit ? "✅" : "❌"} | ${hit ? hit.text.slice(0, 70) : "—"} |`);
  }
  // Duplicate is cross-candidate.
  const dupes = detectDuplicates([
    baseCand({ id: "d1", fullName: "Sam One", email: "dup@x.com" }),
    baseCand({ id: "d2", fullName: "Sam Two", email: "DUP@x.com" }),
  ]);
  const dupHit = dupes.get("d1");
  if (!dupHit) allFired = false;
  say(`| \`duplicate candidate\` | ${dupHit ? "✅" : "❌"} | ${dupHit ? dupHit.text.slice(0, 70) : "—"} |`);
  say("");
  say(allFired ? "**All 8 anomaly rules fire — no silently-dead rule.**\n" : "**❌ A rule failed to fire.**\n");
  return allFired;
}

async function importPath() {
  say("## B. Anomaly engine on REAL imported candidates\n");
  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: PREFIX } } });

  // Simulate a spreadsheet: an inflated-title candidate with low total experience.
  const rows = [
    { Name: `${PREFIX}Inflated Senior`, Email: "ival.inflated@x.com", Country: "Poland", Title: "Senior Software Architect", Years: "1", Skills: "React, Node", Availability: "available" },
    { Name: `${PREFIX}Honest Mid`, Email: "ival.honest@x.com", Country: "Spain", Title: "Mid Developer", Years: "5", Skills: "React, Node", Availability: "available" },
  ];
  const mapping = { fullName: "Name", email: "Email", country: "Country", title: "Title", totalYears: "Years", skills: "Skills", availability: "Availability" };
  const summary = await ingestRows(rows, mapping, { filename: "ival.csv", source: "CSV" });
  say(`Imported ${summary.created} candidates via the real ingest path.`);

  const inflated = await prisma.candidate.findFirstOrThrow({ where: { fullName: `${PREFIX}Inflated Senior` }, include: { skills: { include: { skill: true } }, employments: true } });
  say(`- careerStartYear was DERIVED on import from total years: \`${inflated.careerStartYear}\` (totalYears=${inflated.totalYears}) — P2 fallback.`);

  const input = toCandidateInput(inflated);
  const anomalies = detectAnomalies(input, { currentYear: CURRENT_YEAR });
  say(`- Anomalies detected on the imported candidate: ${anomalies.length}`);
  anomalies.forEach((a) => say(`  - 🔴 ${a.text} \`[${a.rule}]\``));
  const titleFired = anomalies.some((a) => a.rule === "seniority title inconsistent with total experience");
  say("");
  say(titleFired
    ? "**The title-vs-experience anomaly fires on imported data thanks to the careerStartYear fallback.**\n"
    : "**❌ Expected title anomaly did not fire on import.**\n");

  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
  return titleFired;
}

async function cachePath() {
  say("## C. candidate_analysis cache is read AND invalidated\n");
  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
  await prisma.job.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.client.deleteMany({ where: { name: { startsWith: PREFIX } } });

  const client = await prisma.client.create({ data: { name: `${PREFIX}Client`, portalSlug: `ival-${Date.now()}` } });
  const reactId = (await prisma.skill.upsert({ where: { canonicalName: "React" }, create: { canonicalName: "React", synonyms: [] }, update: {} })).id;
  const nodeId = (await prisma.skill.upsert({ where: { canonicalName: "Node.js" }, create: { canonicalName: "Node.js", synonyms: [] }, update: {} })).id;
  const job = await prisma.job.create({ data: { clientId: client.id, title: `${PREFIX}Role`, budgetMax: 50, experienceYearsMin: 5, englishLevel: "B2+", skills: { create: [{ skillId: reactId, required: true, minYears: 4 }, { skillId: nodeId, required: true, minYears: 3 }] } } });
  const cand = await prisma.candidate.create({ data: { fullName: `${PREFIX}Cacher`, dedupeKey: `ival:cacher`, country: "Ukraine", englishLevel: "C1", clientRate: 34, careerStartYear: 2017, totalYears: 9, skills: { create: [{ skillId: reactId, years: 6 }, { skillId: nodeId, years: 7 }] } } });

  const jobRow = await loadJobRow(job.id);
  const results = await runMatch(jobRow!, { limit: 10 });
  await persistAnalyses(job.id, results);
  say(`Ran match + persisted ${results.length} analysis row(s) into the cache.`);

  const c1 = await prisma.candidate.findUniqueOrThrow({ where: { id: cand.id } });
  const j1 = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  const hit = await getFreshAnalysis(cand.id, job.id, c1.updatedAt, j1.updatedAt);
  say(`- Read after compute → cache **${hit.hit ? "HIT" : "MISS"}** (score ${hit.analysis?.matchScore}).`);

  await prisma.candidate.update({ where: { id: cand.id }, data: { availabilityNote: "touched" } });
  const c2 = await prisma.candidate.findUniqueOrThrow({ where: { id: cand.id } });
  const miss = await getFreshAnalysis(cand.id, job.id, c2.updatedAt, j1.updatedAt);
  say(`- After the candidate is edited → cache **${miss.hit ? "HIT" : "MISS"}** (stale=${miss.stale}) → caller recomputes.`);
  say("");
  const ok = hit.hit && !miss.hit && miss.stale;
  say(ok ? "**Cache is read when fresh and correctly invalidated on change.**\n" : "**❌ Cache behavior incorrect.**\n");

  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
  await prisma.job.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.client.deleteMany({ where: { name: { startsWith: PREFIX } } });
  return ok;
}

async function main() {
  say("# ANVI Intelligence Integrity Validation (Mission 3.5 P2)\n");
  say("_Generated by `npm run validate-intelligence`. Reference date 2026-06-04._\n");
  const a = ruleCoverage();
  const b = await importPath();
  const c = await cachePath();
  say("## Verdict\n");
  say(`- All anomaly rules fire: ${a ? "✅" : "❌"}`);
  say(`- Anomalies run on imported candidates (careerStartYear fallback): ${b ? "✅" : "❌"}`);
  say(`- Analysis cache read + invalidated: ${c ? "✅" : "❌"}`);
  say("");
  say(a && b && c ? "**No intelligence path silently fails.**" : "**Issues found — see above.**");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/intelligence-validation.md", out.join("\n") + "\n");
  console.log("\n📝 Wrote reports/intelligence-validation.md");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
