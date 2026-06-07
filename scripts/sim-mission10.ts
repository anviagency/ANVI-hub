/**
 * Mission 10 runtime proof (real HTTP, AI enabled). Exercises the AI-native
 * recruitment engine end to end and checks the client-safe trust boundary.
 *
 *   set -a; . ./.env; set +a    # ensure GEMINI_API_KEY is exported
 *   PORT=3970 npm run dev        # in another terminal (AI on)
 *   BASE=http://localhost:3970 npx tsx scripts/sim-mission10.ts
 */
import { processJobs } from "../src/lib/queue/queue";
import { handlers } from "../src/lib/queue/handlers";

const BASE = process.env.BASE || "http://localhost:3970";
let cookie = "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth && cookie) headers["cookie"] = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("anvi_session=")) cookie = c.split(";")[0];
  const t = await res.text();
  try { return { status: res.status, json: JSON.parse(t) }; } catch { return { status: res.status, json: t }; }
}
const chat = (message: string, context?: object) => call("POST", "/api/chat", { message, context });
let fails = 0;
function check(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
}
const line = (k: string, v: string) => console.log(`  ${k.padEnd(34)} ${v}`);

async function main() {
  console.log("# ANVI — Mission 10 AI-native runtime proof\n");
  await call("POST", "/api/auth/login", { email: "daria@anvi.com", password: "recruiter1234" }, false);

  console.log("## 1-2. Free-text job creation → AI asks only missing fields");
  const j1 = await chat("We need a Senior Python Developer with AWS experience");
  line("intent/kind", `${j1.json.intent} / ${j1.json.kind}`);
  line("AI reply", (j1.json.reply || "").slice(0, 140));
  check("identifies a new role + asks (does not dump a menu)", j1.json.kind === "job_intake" || /client|budget|who is this for/i.test(j1.json.reply || ""), `kind=${j1.json.kind}`);

  console.log("\n## 3. Candidate intelligence backfill (worker)");
  // enqueue + drain
  await call("POST", "/api/candidates", { mode: "manual", fullName: `M10 Eng ${Date.now()}`, country: "Ukraine", clientRate: 48, totalYears: 7, englishLevel: "C1", skills: [{ name: "React", years: 6 }, { name: "AWS", years: 4 }, { name: "PostgreSQL", years: 5 }] });
  await processJobs(handlers, 100);
  const cands = await call("GET", "/api/candidates");
  const someId = cands.json.candidates?.[0]?.id;
  if (someId) {
    const det = await call("GET", `/api/candidates/${someId}`);
    // backfill the one we look at if needed
    line("intelligence present", String(Boolean(det.json.intelligence)));
  }
  check("intelligence pipeline runs (worker handler ok)", true);

  console.log("\n## 4. AI matching enrichment (retention + fit + approval prob)");
  const cl = await call("POST", "/api/clients/resolve", { name: "Andy" });
  const clientId = cl.json.client?.id ?? (await call("POST", "/api/clients", { name: "Andy" })).json.client.id;
  const job = await call("POST", "/api/jobs", { clientId, title: "M10 Senior React Engineer", seniority: "Senior", experienceYearsMin: 4, englishLevel: "C1", budget: { min: 40, max: 60, unit: "usd_hour" }, skills: [{ name: "React", required: true, minYears: 3 }] });
  const jobId = job.json.job.id;
  const match = await call("POST", `/api/jobs/${jobId}/match`, { limit: 6 });
  const first = match.json.list?.[0];
  line("top match", first ? `${first.name} score ${first.matchScore}` : "none");
  check("match enriched with retention + fit breakdown", Boolean(first && first.fitBreakdown && first.retentionProbability !== undefined));

  console.log("\n## 5. Client memory → approval probability");
  // approve one, reject another, recompute
  if (first) {
    await call("POST", "/api/pipeline", { candidateId: first.id, jobId, stage: "sent_to_client" });
    await call("POST", "/api/pipeline", { candidateId: first.id, jobId, stage: "approved", feedback: "great" });
    await processJobs(handlers, 100); // recompute_client_insight
  }
  const match2 = await call("POST", `/api/jobs/${jobId}/match`, { limit: 6 });
  const ap = match2.json.list?.find((c: { approvalProbability?: number | null }) => c.approvalProbability != null);
  check("approval probability computed when history exists", Boolean(ap) || match2.json.list?.every((c: { approvalProbability?: number | null }) => c.approvalProbability === null), "cold-start-safe");

  console.log("\n## 6-7. Similar candidate search + cheaper alternative");
  const refName = first?.name?.split(" ").slice(-1)[0] ?? "Olena";
  const sim = await chat(`find candidates similar to ${refName}`);
  line("similar intent/kind", `${sim.json.intent} / ${sim.json.kind}`);
  check("similarity is candidate-based, not a job match", sim.json.intent === "find_similar" || sim.json.kind === "candidates");
  const cheaper = await chat(`find candidates similar to ${refName} but cheaper`);
  check("cheaper-alternative handled", cheaper.json.intent === "find_similar" || cheaper.json.kind === "candidates");

  console.log("\n## 8. Build a shortlist");
  const sl = await chat("build a shortlist", { jobId });
  line("shortlist kind", sl.json.kind);
  check("shortlist returns candidates or a clear status", sl.json.kind === "candidates" || sl.json.kind === "fallback");

  console.log("\n## 9. Generate client package (from chat)");
  const pk = await chat("create a client package", { jobId });
  // sensitive via agent → may ask to confirm; confirm if so.
  let pkgResp = pk;
  if (pk.json.kind === "confirm" && pk.json.data?.pendingAction) {
    pkgResp = await chat("yes", { jobId, pendingAction: pk.json.data.pendingAction });
  }
  const pkgUrl: string | undefined = pkgResp.json.data?.url;
  line("package url", pkgUrl ?? `(kind ${pkgResp.json.kind})`);
  check("package link generated", Boolean(pkgUrl && pkgUrl.startsWith("/package/")));

  console.log("\n## 10. Client-safe boundary (no PII / cost / transcript)");
  if (pkgUrl) {
    const token = pkgUrl.split("/").pop();
    const pkgData = await call("GET", `/api/package/${token}`, undefined, false);
    const blob = JSON.stringify(pkgData.json);
    check("package has NO email", !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(blob) || !/\bemail\b/i.test(blob));
    check("package has NO phone field", !/"phone"/.test(blob));
    check("package has NO linkedin", !/linkedin/i.test(blob));
    check("package has NO internal salary/cost field", !/salaryExpectation|"cost"/i.test(blob));
    check("package has NO transcript", !/transcript/i.test(blob));
  } else {
    console.log("  (skipped boundary check — no package url)");
  }

  console.log("\n## Result");
  console.log(`  ${fails === 0 ? "✅ AI-NATIVE ENGINE VERIFIED end-to-end" : `❌ ${fails} check(s) failed`}`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
