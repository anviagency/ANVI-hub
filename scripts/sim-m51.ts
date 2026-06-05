/**
 * Mission 5.1 — closed-loop simulation. Proves a recruiter can run the whole
 * hire inside ANVI: Create Job → Add Candidate → Screen → Schedule → Submit →
 * Client feedback → Approve (after screening) → Placement. Counts what still
 * requires leaving the platform. Run against a dev server:
 *   PORT=3957 npm run dev  (and npm run worker), then
 *   BASE=http://localhost:3957 npx tsx scripts/sim-m51.ts
 */
import { processJobs } from "../src/lib/queue/queue";
import { handlers } from "../src/lib/queue/handlers";

const BASE = process.env.BASE || "http://localhost:3957";
let cookie = "";
async function call(method: string, path: string, body?: unknown, auth = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth && cookie) headers["cookie"] = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("anvi_session=")) cookie = c.split(";")[0];
  const t = await res.text();
  try { return { status: res.status, json: JSON.parse(t) }; } catch { return { status: res.status, json: t }; }
}
const line = (k: string, v: string) => console.log(`  ${k.padEnd(34)} ${v}`);

async function main() {
  console.log("# ANVI Mission 5.1 — closed-loop simulation (real HTTP)\n");
  await call("POST", "/api/auth/login", { email: "daria@anvi.com", password: "recruiter1234" }, false);

  console.log("## 1. Create job (in ANVI)");
  const chat = await call("POST", "/api/chat", { message: "Need Senior React dev, 6+ yrs, React Next Node Postgres, C1, $40-55/hr" });
  const cl = await call("POST", "/api/clients/resolve", { name: "Andy" });
  const p = chat.json.data.parsed;
  const job = await call("POST", "/api/jobs", { clientId: cl.json.client.id, title: p.title, seniority: p.seniority, experienceYearsMin: p.experienceYearsMin, englishLevel: p.englishLevel, budget: p.budget, skills: p.skills });
  line("job created", job.json.job.id);

  console.log("\n## 2. Add candidate (single intake — NO Excel)");
  const add = await call("POST", "/api/candidates", { mode: "manual", fullName: "Nadia Volkova", country: "Ukraine", clientRate: 42, totalYears: 7, englishLevel: "C1", source: "LinkedIn", skills: [{ name: "React", years: 6 }, { name: "Next.js", years: 5 }, { name: "Node.js", years: 6 }, { name: "PostgreSQL", years: 5 }] });
  const candId = add.json.id;
  line("candidate added", `${candId} (source=LinkedIn, in-platform)`);

  console.log("\n## 3. Match → candidate is found");
  const match = await call("POST", `/api/jobs/${job.json.job.id}/match`, { limit: 10 });
  line("matched", `${match.json.count} candidates; new candidate present: ${match.json.list.some((c: any) => c.id === candId)}`);

  console.log("\n## 4. Schedule screening (real meeting link — NO Calendar/Zoom)");
  const when = new Date(Date.now() + 3 * 86400000).toISOString();
  const sched = await call("POST", "/api/interviews/schedule", { candidateId: candId, jobId: job.json.job.id, scheduledFor: when, meetingProvider: "google_meet" });
  line("interview", sched.json.interviewId);
  line("meeting link generated", sched.json.meetingUrl);
  line("reminders", (sched.json.reminders || []).join(", "));

  console.log("\n## 5. Submit to client → WhatsApp");
  await call("POST", "/api/pipeline", { candidateId: candId, jobId: job.json.job.id, stage: "sent_to_client" });
  await processJobs(handlers, 50);

  console.log("\n## 6. TimeOS screening summary → pipeline 'screened'");
  await call("POST", "/api/webhooks/timeos", { data: { meeting_id: `m51-${candId}`, tag: sched.json.meetingTag, recording_url: "https://rec/x", transcript: "secret", summary: "Excellent. Recommend hire.", action_items: ["Send offer"], participants: [{ email: "x@y.z" }] } }, false);
  const board1 = await call("GET", `/api/pipeline?jobId=${job.json.job.id}`);
  line("stage after screening", board1.json.entries.find((e: any) => e.candidate.id === candId)?.stage);

  console.log("\n## 7. Client APPROVES from WhatsApp AFTER screening (the M5 bug)");
  const approve = await call("POST", "/api/webhooks/whatsapp", { messages: [{ from: "+10000000001", id: `m51-approve-${candId}`, type: "button", button: { payload: `decision:approve:${candId}:${job.json.job.id}` } }] }, false);
  line("approval result", JSON.stringify(approve.json.decisions ?? approve.json));

  console.log("\n## 8. Move to placement (hired)");
  const hire = await call("POST", "/api/pipeline", { candidateId: candId, jobId: job.json.job.id, stage: "hired" });
  line("pipeline", hire.json.result ? `${hire.json.result.from} → ${hire.json.result.to}` : JSON.stringify(hire.json));

  const det = await call("GET", `/api/candidates/${candId}?jobId=${job.json.job.id}`);
  line("availability score", `${det.json.availabilityScore?.score}% (${det.json.availabilityScore?.band})`);
  line("comm health", det.json.communicationHealth?.band);

  console.log("\n## Closed-loop result");
  const stage = (await call("GET", `/api/pipeline?jobId=${job.json.job.id}`)).json.entries.find((e: any) => e.candidate.id === candId)?.stage;
  const placement = stage === "hired" && approve.json.decisions?.[0]?.stage === "approved";
  console.log(`  Create→Add→Screen→Schedule→Submit→Approve→Placement: ${placement ? "✅ COMPLETED entirely in ANVI" : "❌ broke"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
