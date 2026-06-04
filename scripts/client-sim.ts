/**
 * Client experience simulation (mission Part 5).
 * Stands up a job + 3 candidates, mints a client share link, then drives the
 * full client journey (view → approve / request interview / reject) THROUGH THE
 * SAME public surface a real client uses — counting how many recruiter actions
 * are required (target: zero). Writes reports/client-simulation.md.
 *
 * Run: npx tsx scripts/client-sim.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createShareLink, resolveShareLink, recordDecision } from "../src/lib/share";

const prisma = new PrismaClient();
const PREFIX = "CSIM ";

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

const log: string[] = [];
function say(line: string) {
  console.log(line);
  log.push(line);
}

async function recruiterActions(jobId: string, candidateIds: string[]): Promise<number> {
  // Recruiter actions taken DURING the client phase. We want this to be 0.
  return prisma.candidateEvent.count({
    where: { jobId, candidateId: { in: candidateIds }, actor: "recruiter", createdAt: { gte: clientPhaseStart } },
  });
}

let clientPhaseStart = new Date();

async function main() {
  await cleanup();
  say("# Client Experience Simulation\n");
  say("_Drives the real public share surface (`src/lib/share.ts`) end to end._\n");

  // --- Recruiter sets up (this is the ONLY recruiter involvement) ---
  const client = await prisma.client.create({ data: { name: `${PREFIX}Andy`, company: "Northwind SaaS", portalSlug: `csim-${Date.now()}` } });
  const reactId = await ensureSkill("React");
  const nodeId = await ensureSkill("Node.js");
  const job = await prisma.job.create({
    data: { clientId: client.id, title: `${PREFIX}Senior Full-Stack`, seniority: "Senior", budgetMax: 42, budgetUnit: "usd_hour", experienceYearsMin: 5, englishLevel: "B2+", skills: { create: [{ skillId: reactId, required: true, minYears: 4 }, { skillId: nodeId, required: true, minYears: 3 }] } },
  });
  async function mk(name: string, rate: number, english: string) {
    return prisma.candidate.create({
      data: { fullName: `${PREFIX}${name}`, dedupeKey: `csim:${name}`, title: "Senior Full-Stack Developer", country: "Ukraine", englishLevel: english, availability: "available", clientRate: rate, salaryExpectation: Math.round(rate * 0.7), careerStartYear: 2017, totalYears: 8, aiSummary: `${name} is a strong senior full-stack engineer.`, skills: { create: [{ skillId: reactId, years: 6 }, { skillId: nodeId, years: 7 }] } },
    });
  }
  const A = await mk("Candidate A", 34, "C1");
  const B = await mk("Candidate B", 32, "B2+");
  const C = await mk("Candidate C", 30, "B2");

  // Notes: one client-safe, one internal.
  await prisma.note.create({ data: { candidateId: A.id, jobId: job.id, body: "Confident communicator, available in 2 weeks.", internal: false } });
  await prisma.note.create({ data: { candidateId: A.id, jobId: job.id, body: "INTERNAL: push for higher margin.", internal: true } });

  const link = await createShareLink({
    jobId: job.id,
    clientId: client.id,
    label: "Top 3 — Senior Full-Stack",
    candidates: [{ candidateId: A.id, shareNotes: true }, { candidateId: B.id }, { candidateId: C.id }],
  });
  say(`Recruiter setup done. Share link: \`/share/${link.token}\` (3 candidates).`);
  say("**From here, no recruiter touches the system.**\n");

  // --- CLIENT PHASE (zero recruiter involvement from here) ---
  clientPhaseStart = new Date();
  await new Promise((r) => setTimeout(r, 5)); // ensure timestamp ordering

  say("## Client opens the link");
  const view = await resolveShareLink(link.token);
  say(`Client sees **${view.candidates.length}** candidates for *${view.job.title}*:`);
  for (const c of view.candidates) {
    say(`- **${c.name}** — ${c.country}, ${c.english}, $${c.rate}/hr · match ${c.matchScore} (${c.recommendation}) · ${c.strengths.length} strengths, ${c.risks.length} risks · notes visible: ${c.sharedNotes.length}`);
  }
  // Boundary checks
  const a = view.candidates.find((c) => c.id === A.id)!;
  const internalLeak = a.sharedNotes.some((n) => n.body.includes("INTERNAL"));
  const costLeak = JSON.stringify(view).includes("salaryExpectation");
  const anomalyLeak = JSON.stringify(view).includes("\"anomalies\"");
  say("");
  say("### Boundary checks (what the client must NOT see)");
  say(`- Internal note leaked: ${internalLeak ? "❌ YES" : "✅ no"}`);
  say(`- Internal cost leaked: ${costLeak ? "❌ YES" : "✅ no"}`);
  say(`- Raw anomalies leaked: ${anomalyLeak ? "❌ YES" : "✅ no"}`);
  say("");

  say("## Client makes decisions (in the link, no calls/emails)");
  const d1 = await recordDecision(link.token, A.id, "approve");
  say(`- Approves **Candidate A** → pipeline now \`${d1.stage}\``);
  const d2 = await recordDecision(link.token, B.id, "request_interview");
  say(`- Requests interview with **Candidate B** → pipeline now \`${d2.stage}\``);
  const d3 = await recordDecision(link.token, C.id, "reject", "Not enough SaaS depth");
  say(`- Passes on **Candidate C** (reason captured) → pipeline now \`${d3.stage}\``);
  say("");

  // --- Verify recruiter-side state updated automatically ---
  say("## Recruiter side updated automatically");
  const recruiterTouches = await recruiterActions(job.id, [A.id, B.id, C.id]);
  for (const [name, id] of [["A", A.id], ["B", B.id], ["C", C.id]] as const) {
    const pipe = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: id, jobId: job.id } } });
    const sub = await prisma.submission.findUnique({ where: { jobId_candidateId: { jobId: job.id, candidateId: id } } });
    say(`- Candidate ${name}: stage \`${pipe?.stage}\`, client status \`${sub?.clientStatus}\`${sub?.clientFeedback ? `, feedback: "${sub.clientFeedback}"` : ""}`);
  }
  const notifs = await prisma.notification.count({ where: { jobId: job.id, createdAt: { gte: clientPhaseStart } } });
  const clientEvents = await prisma.candidateEvent.count({ where: { jobId: job.id, actor: "client", createdAt: { gte: clientPhaseStart } } });
  say("");
  say("## Verdict");
  say(`- **Recruiter actions during client phase:** ${recruiterTouches} ${recruiterTouches === 0 ? "✅ (zero-touch achieved)" : "❌"}`);
  say(`- **Client-driven events recorded:** ${clientEvents}`);
  say(`- **Notifications fired to recruiter/Telegram:** ${notifs}`);
  say(`- **Feedback loop closed (rejection reason captured):** ${d3 && (await prisma.submission.findUnique({ where: { jobId_candidateId: { jobId: job.id, candidateId: C.id } } }))?.clientFeedback ? "✅" : "❌"}`);

  const allGood = !internalLeak && !costLeak && !anomalyLeak && recruiterTouches === 0;
  say("");
  say(allGood ? "**Result: client operated the full pipeline with zero recruiter involvement and no internal-data leakage.**" : "**Result: ISSUES FOUND — see boundary checks above.**");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/client-simulation.md", log.join("\n") + "\n");
  console.log("\n📝 Wrote reports/client-simulation.md");

  await cleanup();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
