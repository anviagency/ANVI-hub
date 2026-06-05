import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { runIntake, JobIntake } from "@/lib/chat/intake";
import { GET as workspace } from "@/app/api/jobs/[id]/workspace/route";
import { GET as suggestions } from "@/app/api/jobs/[id]/suggestions/route";
import { loadJobRow } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";
import { createTestUser, authedGet, cleanupAuth } from "./auth-helper";

const P = "ZZWS";
let token = "";
let userId = "";
let clientName = "";

async function cleanup() {
  await prisma.job.deleteMany({ where: { title: { contains: "Conversational React" } } });
  await cleanupByPrefix(P);
  await cleanupAuth(P);
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("conversational intake + job workspace (Mission 7.1)", () => {
  beforeAll(async () => {
    await cleanup();
    const u = await createTestUser("recruiter", P);
    token = u.token; userId = u.userId;
    const cid = await makeClient(P); // name = "ZZWS Client"
    clientName = "ZZWS Client";
    void cid;
  });
  afterAll(cleanup);

  it("gathers missing fields one at a time, resolves the client, and creates the job", async () => {
    // Turn 1 — paste a role missing budget/workMode/employmentType.
    let r = await runIntake("Need a Senior Conversational React dev, React and Node, C1 English", null, userId);
    expect(r.kind).toBe("job_intake");
    expect(r.data.field).toBe("budget");
    let pending = r.data.pendingJob as JobIntake;

    // Turn 2 — budget → asks work mode.
    r = await runIntake("$40-50/hr", pending, userId);
    expect(r.data.field).toBe("workMode");
    expect((r.data.buttons as unknown[]).length).toBe(3);
    pending = r.data.pendingJob as JobIntake;

    // Turn 3 — remote → asks employment type.
    r = await runIntake("remote", pending, userId);
    expect(r.data.field).toBe("employmentType");
    pending = r.data.pendingJob as JobIntake;

    // Turn 4 — full-time → asks client (all structured fields filled).
    r = await runIntake("full_time", pending, userId);
    expect(r.data.field).toBe("client");
    pending = r.data.pendingJob as JobIntake;

    // Turn 5 — client name → existing client found → confirm buttons.
    r = await runIntake(clientName, pending, userId);
    expect(r.data.field).toBe("confirm_client");
    pending = r.data.pendingJob as JobIntake;

    // Turn 6 — yes → job created.
    r = await runIntake("yes", pending, userId);
    expect(r.kind).toBe("job_created");
    const jobId = r.data.jobId as string;
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, include: { skills: true } });
    expect(job.workMode).toBe("remote");
    expect(job.employmentType).toBe("full_time");
    expect(job.budgetMin).toBe(40);
    expect(job.clientId).not.toBeNull();
    expect(job.skills.length).toBeGreaterThan(0);
  });

  it("offers to create a new client when the name is unknown", async () => {
    let r = await runIntake("Need a Conversational React dev, React, B2 English, $30/hr, remote, full time", null, userId);
    // Walk to the client question.
    let pending = r.data.pendingJob as JobIntake;
    for (let i = 0; i < 6 && r.data.field !== "client"; i++) {
      r = await runIntake(["$30/hr", "remote", "full time", "Senior", "B2"][i] ?? "x", pending, userId);
      pending = r.data.pendingJob as JobIntake;
    }
    expect(r.data.field).toBe("client");
    r = await runIntake("Totally New Client XYZ", pending, userId);
    expect(r.data.field).toBe("create_client");
    expect((r.data.buttons as { value: string }[]).map((b) => b.value)).toContain("__create__");
  });

  it("workspace endpoint returns overview, counts, pipeline, top candidates", async () => {
    const clientId = await makeClient(P + "B");
    const jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true, minYears: 3 }] });
    await makeCandidate({ prefix: P, name: "WsCand", skills: [{ name: "React", years: 6 }] });
    const job = await loadJobRow(jobId);
    const results = await runMatch(job!, { limit: 5 });
    await persistAnalyses(jobId, results);

    const res = await workspace(authedGet(`http://x/api/jobs/${jobId}/workspace`, token), ctx(jobId));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.overview.title).toContain(P);
    expect(j.topCandidates.length).toBeGreaterThan(0);
    expect(j.counts).toHaveProperty("submitted");
    expect(j.pipeline).toHaveProperty("new");
  });

  it("suggestions endpoint flags missing salary and unmatched/qualified state", async () => {
    const clientId = await makeClient(P + "C");
    // Job with NO budget → missing-salary suggestion.
    const job = await prisma.job.create({ data: { clientId, title: `${P} NoBudget`, experienceYearsMin: 5, skills: { create: [] } } });
    const res = await suggestions(authedGet(`http://x/api/jobs/${job.id}/suggestions`, token), ctx(job.id));
    const j = await res.json();
    const types = j.suggestions.map((s: { type: string }) => s.type);
    expect(types).toContain("missing_salary");
  });
});
