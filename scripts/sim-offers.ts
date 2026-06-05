/**
 * Offer + placement runtime proof (spec §8 / §16). Proves the funnel closes
 * end-to-end over real HTTP against the real database:
 *   create job → add candidate → match → submit → extend offer → accept →
 *   hire → placement (with real start date) → onboarding management.
 *
 * Also proves the guard rails: no offer for an un-advanced candidate (422),
 * no duplicate open offer (409), illegal offer transition rejected, and that
 * the placement projection never carries internal salary (cost).
 *
 * Run against a dev server:
 *   PORT=3957 npm run dev   (in another terminal), then
 *   BASE=http://localhost:3957 npx tsx scripts/sim-offers.ts
 */
import { processJobs } from "../src/lib/queue/queue";
import { handlers } from "../src/lib/queue/handlers";

const BASE = process.env.BASE || "http://localhost:3957";
let cookie = "";

interface Call {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

async function call(method: string, path: string, body?: unknown, auth = true): Promise<Call> {
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

const line = (k: string, v: string) => console.log(`  ${k.padEnd(38)} ${v}`);
let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  console.log("# ANVI — Offer + Placement runtime proof (real HTTP)\n");
  await call("POST", "/api/auth/login", { email: "daria@anvi.com", password: "recruiter1234" }, false);

  console.log("## 1. Create job + add candidate");
  const cl = await call("POST", "/api/clients/resolve", { name: "Andy" });
  const clientId = cl.json.client?.id ?? (await call("POST", "/api/clients", { name: "Andy" })).json.client.id;
  const job = await call("POST", "/api/jobs", {
    clientId,
    title: "Offer-Sim Senior React Engineer",
    seniority: "Senior",
    experienceYearsMin: 5,
    englishLevel: "C1",
    budget: { min: 45, max: 65, unit: "usd_hour" },
    skills: [{ name: "React", required: true, minYears: 4 }],
  });
  const jobId = job.json.job.id;
  line("job created", jobId);

  const add = await call("POST", "/api/candidates", {
    mode: "manual",
    fullName: `OfferSim Closer ${Date.now()}`,
    country: "Ukraine",
    clientRate: 55,
    salaryExpectation: 40,
    totalYears: 7,
    englishLevel: "C1",
    skills: [{ name: "React", years: 6 }],
  });
  const candId = add.json.id;
  line("candidate added", candId);

  console.log("\n## 2. Guard: cannot offer a candidate who hasn't reached the client");
  const premature = await call("POST", "/api/offers", { candidateId: candId, jobId });
  expect("premature offer rejected (422)", premature.status === 422, `status=${premature.status} code=${premature.json.code}`);

  console.log("\n## 3. Advance to client + extend an offer");
  await call("POST", "/api/pipeline", { candidateId: candId, jobId, stage: "sent_to_client" });
  await processJobs(handlers, 50);
  const offer = await call("POST", "/api/offers", { candidateId: candId, jobId, clientRate: 62, startDate: "2026-08-03T09:00:00.000Z" });
  expect("offer created (201)", offer.status === 201, `status=${offer.status}`);
  const offerId = offer.json.offer?.id;
  line("offer id", `${offerId} (status=${offer.json.offer?.status}, rate=$${offer.json.offer?.clientRate}/hr)`);

  const board1 = await call("GET", `/api/pipeline?jobId=${jobId}`);
  const stage1 = board1.json.entries.find((e: { candidate: { id: string } }) => e.candidate.id === candId)?.stage;
  expect("pipeline moved to 'offer'", stage1 === "offer", `stage=${stage1}`);

  console.log("\n## 4. Guard: no duplicate open offer");
  const dup = await call("POST", "/api/offers", { candidateId: candId, jobId });
  expect("duplicate open offer rejected (409)", dup.status === 409, `status=${dup.status} code=${dup.json.code}`);

  console.log("\n## 5. Accept the offer → hire + placement");
  const accept = await call("PATCH", `/api/offers/${offerId}`, { status: "accepted" });
  expect("offer accepted", accept.json.offer?.status === "accepted");
  expect("placement created", Boolean(accept.json.placementId), `placementId=${accept.json.placementId}`);

  const board2 = await call("GET", `/api/pipeline?jobId=${jobId}`);
  const stage2 = board2.json.entries.find((e: { candidate: { id: string } }) => e.candidate.id === candId)?.stage;
  expect("pipeline moved to 'hired'", stage2 === "hired", `stage=${stage2}`);

  console.log("\n## 6. Placement appears on the workforce board with the offer's start date");
  const placements = await call("GET", `/api/placements?clientId=${clientId}`);
  const placement = placements.json.placements.find((p: { id: string }) => p.id === accept.json.placementId);
  expect("placement listed", Boolean(placement));
  expect("start date inherited from offer", placement?.startDate?.startsWith("2026-08-03"), `startDate=${placement?.startDate}`);
  expect("client rate inherited from offer ($62)", placement?.clientRate === 62, `clientRate=${placement?.clientRate}`);
  // Trust boundary: the recruiter placement projection exposes the price, never cost.
  expect("placement projection has NO salary (cost)", !Object.prototype.hasOwnProperty.call(placement ?? {}, "salary"));

  console.log("\n## 7. Manage the placement (set onboarding + start date)");
  const upd = await call("PATCH", `/api/placements/${accept.json.placementId}`, { onboardingStatus: "in_progress", notes: "Laptop shipped, NDA signed" });
  expect("onboarding updated", upd.json.placement?.onboardingStatus === "in_progress");

  console.log("\n## 8. Illegal transition rejected (accept-after-accept is terminal)");
  const reaccept = await call("PATCH", `/api/offers/${offerId}`, { status: "declined" });
  expect("declining an accepted offer rejected (422)", reaccept.status === 422, `status=${reaccept.status} code=${reaccept.json.code}`);

  console.log("\n## Result");
  console.log(`  Submit → Offer → Accept → Hire → Placement → Onboarding: ${failures === 0 ? "✅ FUNNEL CLOSED end-to-end in ANVI" : `❌ ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
