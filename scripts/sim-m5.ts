/**
 * Mission 5 — full lifecycle simulation against real seeded data.
 * Observes behavior, timings, and gaps. Does NOT change product code.
 * Run: PORT=3956 npm run dev (and npm run worker), then
 *      BASE=http://localhost:3956 npx tsx scripts/sim-m5.ts
 */
import { performance } from "node:perf_hooks";

const BASE = process.env.BASE || "http://localhost:3956";
let cookie = "";
const obs: string[] = [];
function note(s: string) { console.log(s); obs.push(s); }

async function call(method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; json: any; ms: number }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth && cookie) headers["cookie"] = cookie;
  const t = performance.now();
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ms = performance.now() - t;
  for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("anvi_session=")) cookie = c.split(";")[0];
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, ms };
}
const ms = (n: number) => `${n.toFixed(0)}ms`;

async function main() {
  note("# ANVI Mission 5 — lifecycle simulation\n");
  await call("POST", "/api/auth/login", { email: "daria@anvi.com", password: "recruiter1234" }, false);

  // ---- STEP 1: recruiter creates a job (chat-first) ----
  note("## 1. Create a job");
  const paste = "Need Senior React Engineer\n6+ years\nReact, Next.js, TypeScript, Node\nC1 English\n$40-55/hour";
  const chat = await call("POST", "/api/chat", { message: paste });
  note(`  chat intent=${chat.json.intent} kind=${chat.json.kind} (${ms(chat.ms)})`);
  note(`  parsed.title="${chat.json.data?.parsed?.title}" client=${chat.json.data?.parsed?.missingFields?.includes("client") ? "UNKNOWN (must resolve)" : "set"} source=${chat.json.data?.parsed?.source}`);
  note(`  OBSERVE: chat returns a PREVIEW only — job is NOT persisted by the chat turn.`);
  // Resolve client + save (the steps the UI card walks through)
  const resolve = await call("POST", "/api/clients/resolve", { name: "Andy" });
  note(`  resolve "Andy" -> found=${resolve.json.found} (${resolve.json.client?.company})`);
  const p = chat.json.data.parsed;
  const saved = await call("POST", "/api/jobs", { clientId: resolve.json.client.id, title: p.title, seniority: p.seniority, experienceYearsMin: p.experienceYearsMin, englishLevel: p.englishLevel, budget: p.budget, skills: p.skills, descriptionRaw: paste });
  const jobId = saved.json.job.id;
  note(`  POST /api/jobs -> ${saved.status} job=${jobId} (${ms(saved.ms)})`);
  note(`  GAP: creating one job took chat + clients/resolve + jobs = 3 calls / several UI clicks.\n`);

  // ---- STEP 2: candidate matching ----
  note("## 2. Candidate matching");
  const match = await call("POST", `/api/jobs/${jobId}/match`, { limit: 8 });
  note(`  matched ${match.json.count} candidates in ${ms(match.ms)} (source=${match.json.source})`);
  const list = match.json.list ?? [];
  list.slice(0, 5).forEach((c: any) => note(`    ${String(c.matchScore).padStart(3)} ${c.recommendation.padEnd(8)} ${c.name}${c.anomalies?.length ? `  🔴x${c.anomalies.length}` : ""}  fresh=${c.freshness?.band}`));
  if (list.length === 0) note("  OBSERVE: 0 matches — pool may lack candidates for this exact role (sourcing gap).");
  const top = list[0];
  note("");

  // ---- STEP 3: candidate review ----
  note("## 3. Candidate review (data room)");
  if (top) {
    const det = await call("GET", `/api/candidates/${top.id}?jobId=${jobId}`);
    const c = det.json.candidate;
    note(`  ${c.name}: cvUrl=${c.cvUrl ?? "NONE"} linkedin=${c.linkedinUrl ?? "NONE"} source=${c.source}`);
    note(`  notes=${det.json.notes.length} interviews=${det.json.interviews.length} timeline=${det.json.timeline.length} analysisSource=${det.json.analysisSource}`);
    note(`  GAP: no CV file/preview (cvUrl is a bare string, no upload/storage). No candidate comms thread.`);
  }
  note("");

  // ---- STEP 4 + 8: screening / interview scheduling ----
  note("## 4/8. Screening + interview scheduling");
  const when = new Date(Date.now() + 5 * 86400000).toISOString();
  const sched = await call("POST", "/api/interviews/schedule", { candidateId: top.id, jobId, scheduledFor: when });
  note(`  scheduled interview=${sched.json.interviewId} tag=${sched.json.meetingTag} reminders=[${sched.json.reminders}]`);
  note(`  GAP: no real calendar event, no meeting link generated, no candidate invite sent. Tag must be pasted into the call tool manually.`);
  note("");

  // ---- STEP 5: submission ----
  note("## 5. Candidate submission");
  const submit = await call("POST", "/api/pipeline", { candidateId: top.id, jobId, stage: "sent_to_client" });
  note(`  pipeline ${submit.json.result?.from} -> ${submit.json.result?.to} (${ms(submit.ms)})`);
  note("");

  // ---- STEP 6: client portal ----
  note("## 6. Client portal (share link)");
  const share = await call("POST", `/api/jobs/${jobId}/share`, { candidates: [{ candidateId: top.id }], label: "Top pick" });
  note(`  share link: ${share.json.url}`);
  const portal = await call("GET", `/api/share/${share.json.token}`, undefined, false);
  const pc = portal.json.candidates?.[0];
  note(`  portal shows: ${pc?.name} score=${pc?.matchScore} rate=$${pc?.rate} interview=${pc?.interview ? "yes" : "none"}`);
  note(`  OBSERVE: portal is per-job share link; no persistent client login/dashboard across jobs.`);
  note("");

  // ---- STEP 7: WhatsApp notifications ----
  note("## 7. WhatsApp notifications");
  await new Promise((r) => setTimeout(r, 1500)); // let worker deliver
  const wa = await call("GET", `/api/whatsapp/messages?candidateId=${top.id}`);
  (wa.json.messages ?? []).slice(0, 5).forEach((m: any) => note(`    [${m.direction}/${m.status}] ${m.event} -> ${m.toNumber ?? m.fromNumber ?? "?"}`));
  note("");

  // ---- STEP 9: TimeOS ingestion ----
  note("## 9. TimeOS summary ingestion");
  const ingest = await call("POST", "/api/webhooks/timeos", { data: { meeting_id: `sim-${top.id}`, tag: sched.json.meetingTag, recording_url: "https://rec.example/sim", transcript: "transcript", summary: "Strong screening.", action_items: ["Confirm start date"], participants: [{ email: "x@y.z" }] } }, false);
  note(`  ingest=${ingest.json.status} interview=${ingest.json.interviewId}`);
  const pipe2 = await call("GET", `/api/pipeline?jobId=${jobId}`);
  const stage = pipe2.json.entries?.find((e: any) => e.candidate.id === top.id)?.stage;
  note(`  pipeline stage after screening summary: ${stage}`);
  note("");

  // ---- STEP 10: approval / rejection ----
  note("## 10. Approval / rejection");
  const approve = await call("POST", "/api/webhooks/whatsapp", { messages: [{ from: "+10000000001", id: `sim-approve-${top.id}`, type: "button", button: { payload: `decision:approve:${top.id}:${jobId}` } }] }, false);
  note(`  WhatsApp approve -> ${JSON.stringify(approve.json.decisions)}`);
  note("");

  // ---- Probe: which chat intents actually work? ----
  note("## Probe — chat intents promised vs working");
  for (const msg of ["compare Artem and Oleksandr", "find candidates like Artem but cheaper", "is Artem still available?", "who haven't I contacted?", "what's pending with Andy?"]) {
    const r = await call("POST", "/api/chat", { message: msg });
    const working = r.json.kind !== "fallback";
    note(`  "${msg}" -> intent=${r.json.intent} kind=${r.json.kind} ${working ? "WORKS" : "NOT IMPLEMENTED (fallback)"}`);
  }
  note("");

  // ---- Probe: missing endpoints ----
  note("## Probe — endpoints a recruiter would expect");
  for (const [label, path] of [["analytics/dashboard", "/api/analytics"], ["candidate messaging", `/api/candidates/${top.id}/message`], ["calendar", "/api/calendar"], ["offers", "/api/offers"], ["reports", "/api/reports"]]) {
    const r = await call("GET", path);
    note(`  ${label.padEnd(22)} ${path} -> ${r.status === 404 ? "404 (absent)" : r.status}`);
  }

  note("\n✅ Simulation complete.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
