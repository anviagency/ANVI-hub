/**
 * Mission 4 end-to-end demo over real HTTP (Part 9).
 * Job → candidate submitted → WhatsApp queued/sent → client approves via WhatsApp
 * → schedule screening → TimeOS summary webhook → interview attached → client
 * receives screening-completed message. Run against a dev server:
 *   PORT=3955 npm run dev &   then   BASE=http://localhost:3955 npx tsx scripts/demo-m4.ts
 */
import { processJobs } from "../src/lib/queue/queue";
import { handlers } from "../src/lib/queue/handlers";

const BASE = process.env.BASE || "http://localhost:3955";
let cookie = "";

async function call(method: string, path: string, body?: unknown, auth = true): Promise<any> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth && cookie) headers["cookie"] = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) if (c.startsWith("anvi_session=")) cookie = c.split(";")[0];
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

async function main() {
  console.log("# Mission 4 — WhatsApp + TimeOS demo (real HTTP)\n");

  const login = await call("POST", "/api/auth/login", { email: "daria@anvi.com", password: "recruiter1234" }, false);
  line("login", `${login.status} (${login.json.user?.role})`);

  const jobs = await call("GET", "/api/jobs");
  const job = jobs.json.jobs.find((j: any) => /Full-Stack/.test(j.title));
  line("full-stack job", job.id);

  await call("POST", `/api/jobs/${job.id}/match`, { limit: 8 }); // cache analyses

  const board = await call("GET", `/api/pipeline?jobId=${job.id}&stage=new`);
  const cand = board.json.entries[0]?.candidate;
  line("candidate to submit", `${cand.name} (${cand.id})`);

  console.log("\n## 1. Submit candidate → sent_to_client");
  const submit = await call("POST", "/api/pipeline", { candidateId: cand.id, jobId: job.id, stage: "sent_to_client" });
  line("pipeline", `${submit.json.result.from} → ${submit.json.result.to}`);

  console.log("\n## 2. WhatsApp candidate_submitted (queued, no inline HTTP)");
  let wa = await call("GET", `/api/whatsapp/messages?candidateId=${cand.id}`);
  let submitted = wa.json.messages.find((m: any) => m.event === "candidate_submitted");
  line("message", `event=${submitted.event} status=${submitted.status} to=${submitted.toNumber}`);
  line("body (line 1)", submitted.body.split("\n")[0]);
  line("internal note leaked?", submitted.body.includes("INTERNAL") ? "YES ❌" : "no ✅");

  console.log("\n## 3. Worker delivers the WhatsApp message");
  const n = await processJobs(handlers, 50);
  line("jobs processed", String(n));
  wa = await call("GET", `/api/whatsapp/messages?candidateId=${cand.id}`);
  submitted = wa.json.messages.find((m: any) => m.event === "candidate_submitted");
  line("candidate_submitted now", submitted.status);

  console.log("\n## 4. Client APPROVES from WhatsApp (inbound webhook)");
  const inbound = await call("POST", "/api/webhooks/whatsapp",
    { messages: [{ from: "+10000000001", id: `demo-approve-${cand.id}`, type: "button", button: { payload: `decision:approve:${cand.id}:${job.id}` } }] }, false);
  line("inbound", JSON.stringify(inbound.json.decisions));

  console.log("\n## 5. Recruiter schedules screening (+ reminders)");
  const when = new Date(Date.now() + 7 * 86400000).toISOString();
  const sched = await call("POST", "/api/interviews/schedule", { candidateId: cand.id, jobId: job.id, scheduledFor: when });
  line("interview", sched.json.interviewId);
  line("meeting tag", sched.json.meetingTag);
  line("reminders queued", (sched.json.reminders || []).join(", "));

  console.log("\n## 6. TimeOS summary webhook → attach + advance pipeline");
  const ingest = await call("POST", "/api/webhooks/timeos",
    { data: { meeting_id: `demo-meeting-${cand.id}`, tag: sched.json.meetingTag, recording_url: "https://rec.example/demo", transcript: "SECRET TRANSCRIPT — internal only", summary: "Excellent screening. Strong match.", action_items: ["Send portfolio", "Confirm start date"], participants: [{ email: "x@y.z" }] } }, false);
  line("ingest", `${ingest.json.status} interview=${ingest.json.interviewId}`);

  console.log("\n## 7. Result");
  const pipe = await call("GET", `/api/pipeline?jobId=${job.id}`);
  const stage = pipe.json.entries.find((e: any) => e.candidate.id === cand.id)?.stage;
  line("pipeline stage now", stage);
  wa = await call("GET", `/api/whatsapp/messages?candidateId=${cand.id}`);
  const screening = wa.json.messages.find((m: any) => m.event === "screening_completed");
  line("screening_completed wa", screening ? screening.status : "NONE");

  const detail = await call("GET", `/api/candidates/${cand.id}?jobId=${job.id}`);
  const iv = detail.json.interviews[0];
  line("interview recording", iv.recordingUrl);
  line("transcript available", String(iv.transcriptAvailable));
  line("webhook status", iv.webhookStatus);

  // Idempotency re-check.
  const dupWa = await call("POST", "/api/webhooks/whatsapp", { messages: [{ from: "+10000000001", id: `demo-approve-${cand.id}`, type: "button", button: { payload: `decision:approve:${cand.id}:${job.id}` } }] }, false);
  const dupTimeos = await call("POST", "/api/webhooks/timeos", { data: { meeting_id: `demo-meeting-${cand.id}`, summary: "again" } }, false);
  console.log("\n## 8. Idempotency");
  line("duplicate WhatsApp", `duplicates=${dupWa.json.duplicates}`);
  line("duplicate TimeOS", dupTimeos.json.status);

  console.log("\n✅ Demo complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
