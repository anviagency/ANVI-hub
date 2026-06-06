/**
 * Mission 8 — Pilot-readiness runtime proof (real HTTP against the real DB).
 * Exercises: no-fake-links (Phase 1), real scheduling + proposed slots + reschedule
 * + cancel (Phase 2), the candidate confirmation flow (Phase 3), minimal client
 * comms (Phase 4), and the offer→placement close (Phase 5).
 *
 *   PORT=3957 npm run dev   (in another terminal), then
 *   BASE=http://localhost:3957 npx tsx scripts/sim-pilot-m8.ts
 */
import { processJobs } from "../src/lib/queue/queue";
import { handlers } from "../src/lib/queue/handlers";

const BASE = process.env.BASE || "http://localhost:3957";
let cookie = "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth && cookie) headers["cookie"] = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("anvi_session=")) cookie = c.split(";")[0];
  const t = await res.text();
  try {
    return { status: res.status, json: JSON.parse(t) };
  } catch {
    return { status: res.status, json: t };
  }
}

const line = (k: string, v: string) => console.log(`  ${k.padEnd(40)} ${v}`);
let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  console.log("# ANVI — Mission 8 Pilot-Readiness runtime proof (real HTTP)\n");
  await call("POST", "/api/auth/login", { email: "daria@anvi.com", password: "recruiter1234" }, false);

  console.log("## Setup: job + candidate + submit");
  const cl = await call("POST", "/api/clients/resolve", { name: "Andy" });
  const clientId = cl.json.client?.id ?? (await call("POST", "/api/clients", { name: "Andy" })).json.client.id;
  const job = await call("POST", "/api/jobs", { clientId, title: "M8 Senior React Engineer", seniority: "Senior", experienceYearsMin: 5, englishLevel: "C1", budget: { min: 45, max: 65, unit: "usd_hour" }, skills: [{ name: "React", required: true, minYears: 4 }] });
  const jobId = job.json.job.id;
  const add = await call("POST", "/api/candidates", { mode: "manual", fullName: `M8 Closer ${Date.now()}`, country: "Ukraine", clientRate: 55, salaryExpectation: 40, totalYears: 7, englishLevel: "C1", skills: [{ name: "React", years: 6 }] });
  const candId = add.json.id;
  await call("POST", "/api/pipeline", { candidateId: candId, jobId, stage: "sent_to_client" });
  await processJobs(handlers, 50);
  line("job / candidate", `${jobId} / ${candId}`);

  console.log("\n## Phase 2: real scheduling — propose slots, then a fixed time with a REAL link");
  const slotA = new Date(Date.now() + 3 * 86400000).toISOString();
  const slotB = new Date(Date.now() + 4 * 86400000).toISOString();
  const proposed = await call("POST", "/api/interviews/schedule", { candidateId: candId, jobId, proposedSlots: [slotA, slotB], timezone: "Europe/Kyiv", durationMins: 45 });
  check("propose slots → status 'proposed', no reminders yet", proposed.json.status === "proposed" && (proposed.json.reminders?.length ?? 0) === 0, `status=${proposed.json.status}`);
  check("no fake meeting link fabricated", proposed.json.meetingUrl === null && proposed.json.meetingProvisioned === false);

  const when = new Date(Date.now() + 5 * 86400000).toISOString();
  const realUrl = "https://meet.google.com/abc-defg-hij";
  const fixed = await call("POST", "/api/interviews/schedule", { candidateId: candId, jobId, scheduledFor: when, timezone: "Europe/Kyiv", durationMins: 45, meetingUrl: realUrl });
  check("fixed time with recruiter link → provisioned", fixed.json.meetingUrl === realUrl && fixed.json.meetingProvisioned === true);
  check("reminders scheduled (24h/1h/10m)", JSON.stringify(fixed.json.reminders) === JSON.stringify(["24h", "1h", "10m"]), JSON.stringify(fixed.json.reminders));
  const ivId = fixed.json.interviewId;

  const reWhen = new Date(Date.now() + 6 * 86400000).toISOString();
  const resched = await call("PATCH", `/api/interviews/${ivId}`, { scheduledFor: reWhen });
  check("reschedule works + re-issues reminders", resched.json.ok === true && (resched.json.reminders?.length ?? 0) > 0);
  const cancel = await call("DELETE", `/api/interviews/${ivId}`, { reason: "client conflict" });
  check("cancel works", cancel.json.cancelled === true);

  console.log("\n## Phase 1: client share view exposes NO fake links");
  const share = await call("POST", `/api/jobs/${jobId}/share`, { candidates: [{ candidateId: candId }], label: "M8" });
  const view = await call("GET", `/api/share/${share.json.token}`, undefined, false);
  const cv = view.json.candidates.find((c: { id: string }) => c.id === candId);
  const noFake = !JSON.stringify(view.json).includes("rec.example") && !JSON.stringify(view.json).includes("meet.google.com/zzz");
  check("no fabricated/dead links in client payload", noFake);
  line("client interview projection", JSON.stringify(cv?.interview ?? null));

  console.log("\n## Phase 3: candidate micro-surface");
  const access = await call("POST", `/api/candidates/${candId}/access`, { jobId });
  check("candidate link minted", access.status === 201 && Boolean(access.json.token), `status=${access.status}`);
  const token = access.json.token;
  const cview = await call("GET", `/api/candidate/${token}`, undefined, false);
  check("candidate self-view loads (name + role)", Boolean(cview.json.candidate?.name) && Boolean(cview.json.job?.title));
  const confAvail = await call("POST", `/api/candidate/${token}`, { action: "confirm_availability" }, false);
  check("candidate confirms availability", confAvail.json.availability === "available");
  const det = await call("GET", `/api/candidates/${candId}?jobId=${jobId}`);
  check("availability score reflects confirmation", (det.json.availabilityScore?.score ?? 0) > 0, `score=${det.json.availabilityScore?.score}`);

  // Give the candidate an interview to respond to.
  await call("POST", "/api/interviews/schedule", { candidateId: candId, jobId, scheduledFor: new Date(Date.now() + 7 * 86400000).toISOString(), timezone: "Europe/Kyiv" });
  const confIv = await call("POST", `/api/candidate/${token}`, { action: "confirm_interview" }, false);
  check("candidate confirms interview", confIv.json.interviewStatus === "confirmed");
  const resReq = await call("POST", `/api/candidate/${token}`, { action: "request_reschedule", message: "Mornings work better" }, false);
  check("candidate requests another time", resReq.json.interviewStatus === "reschedule_requested");

  console.log("\n## Phase 4: minimal client communication");
  const q = await call("POST", `/api/share/${share.json.token}/message`, { candidateId: candId, kind: "question", body: "Can he start in August?" }, false);
  check("client question accepted + recorded", q.json.ok === true);
  const rr = await call("POST", `/api/share/${share.json.token}/message`, { candidateId: candId, kind: "reschedule_request", body: "Prefer afternoons" }, false);
  check("client 'request another time' accepted", rr.json.ok === true);

  console.log("\n## Phase 5: offer → accept → placement → start date → workforce");
  await call("POST", "/api/pipeline", { candidateId: candId, jobId, stage: "approved", feedback: "looks great" });
  const offer = await call("POST", "/api/offers", { candidateId: candId, jobId, clientRate: 62, startDate: "2026-08-03T09:00:00.000Z" });
  check("offer sent", offer.status === 201, `status=${offer.status}`);
  const accept = await call("PATCH", `/api/offers/${offer.json.offer.id}`, { status: "accepted" });
  check("offer accepted → placement created", Boolean(accept.json.placementId));
  const placements = await call("GET", `/api/placements?clientId=${clientId}`);
  const pl = placements.json.placements.find((p: { id: string }) => p.id === accept.json.placementId);
  check("worker appears in workforce with start date", Boolean(pl) && pl.startDate?.startsWith("2026-08-03"), `startDate=${pl?.startDate}`);
  check("placement carries price, never cost (salary)", pl && !Object.prototype.hasOwnProperty.call(pl, "salary"));

  console.log("\n## Result");
  console.log(`  ${failures === 0 ? "✅ PILOT-READY: recruiter → client → candidate → hire, no fake links, no dead ends" : `❌ ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
