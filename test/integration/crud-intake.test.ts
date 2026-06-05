import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { POST as createCandidate } from "@/app/api/candidates/route";
import { PATCH as editCandidate, DELETE as deleteCandidate } from "@/app/api/candidates/[id]/route";
import { POST as restoreCandidate } from "@/app/api/candidates/[id]/restore/route";
import { POST as scheduleInterview } from "@/app/api/interviews/schedule/route";
import { DELETE as cancelInterview, PATCH as rescheduleInterview } from "@/app/api/interviews/[id]/route";
import { loadJobRow } from "@/lib/jobs";
import { runMatch } from "@/lib/matching/funnel";
import { ingestRows } from "@/lib/import/ingest";
import { makeClient, makeJob, cleanupByPrefix } from "./fixtures";
import { createTestUser, authedReq, cleanupAuth } from "./auth-helper";

const P = "ZZCRUD";
let token = "";
let jobId = "";

async function cleanup() {
  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: P } } });
  await prisma.candidate.deleteMany({ where: { email: "crud.cv@test.example" } });
  await cleanupByPrefix(P);
  await cleanupAuth(P);
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("CRUD + intake + scheduling (Mission 5.1)", () => {
  beforeAll(async () => {
    await cleanup();
    token = (await createTestUser("recruiter", P)).token;
    const clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true, minYears: 3 }, { name: "Node.js", required: true, minYears: 3 }] });
  });
  afterAll(cleanup);

  it("manual intake creates a MATCHABLE candidate (skill years > 0)", async () => {
    const res = await createCandidate(authedReq("POST", "http://x/api/candidates", token, {
      mode: "manual", fullName: `${P} Manual One`, country: "Poland", clientRate: 35, totalYears: 7, englishLevel: "C1", source: "Referral",
      skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 7 }],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: json.id }, include: { skills: true } });
    expect(cand.source).toBe("Referral");
    expect(cand.skills.every((s) => s.years > 0)).toBe(true);
    // It actually matches the job (years satisfy minYears).
    const job = await loadJobRow(jobId);
    const results = await runMatch(job!, { limit: 20 });
    expect(results.some((r) => r.candidate.id === json.id)).toBe(true);
  });

  it("CV intake extracts skills from pasted text (none zero)", async () => {
    const cvText = `Olena Kovalenko\nSenior Full-Stack Engineer\nUkraine\n8 years experience\nC1 English\nSkills: React, Next.js, Node.js, PostgreSQL, TypeScript`;
    const res = await createCandidate(authedReq("POST", "http://x/api/candidates", token, { mode: "cv", cvText, email: "crud.cv@test.example" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: json.id }, include: { skills: { include: { skill: true } } } });
    const names = cand.skills.map((s) => s.skill.canonicalName);
    expect(names).toEqual(expect.arrayContaining(["React", "Node.js", "PostgreSQL"]));
    expect(cand.skills.every((s) => s.years > 0)).toBe(true);
    expect(cand.cvText).toContain("Olena");
  });

  it("LinkedIn intake stores the URL and source", async () => {
    const res = await createCandidate(authedReq("POST", "http://x/api/candidates", token, { mode: "linkedin", linkedinUrl: "https://linkedin.com/in/maria-petrova-dev", fullName: `${P} Maria` }));
    const json = await res.json();
    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: json.id } });
    expect(cand.linkedinUrl).toContain("maria-petrova");
    expect(cand.source).toBe("LinkedIn");
  });

  it("edit, soft-delete (excluded from matching), and restore", async () => {
    const created = await (await createCandidate(authedReq("POST", "http://x/api/candidates", token, { mode: "manual", fullName: `${P} Editable`, clientRate: 30, totalYears: 6, skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 6 }] }))).json();
    const id = created.id;
    // edit
    const edit = await editCandidate(authedReq("PATCH", `http://x/api/candidates/${id}`, token, { clientRate: 99, confirmAvailability: true }), ctx(id));
    expect(edit.status).toBe(200);
    const afterEdit = await prisma.candidate.findUniqueOrThrow({ where: { id } });
    expect(afterEdit.clientRate).toBe(99);
    expect(afterEdit.availabilityConfirmedAt).not.toBeNull();
    // soft delete
    await deleteCandidate(authedReq("DELETE", `http://x/api/candidates/${id}`, token), ctx(id));
    const deleted = await prisma.candidate.findUniqueOrThrow({ where: { id } });
    expect(deleted.deletedAt).not.toBeNull();
    // excluded from matching
    const job = await loadJobRow(jobId);
    const results = await runMatch(job!, { limit: 50 });
    expect(results.some((r) => r.candidate.id === id)).toBe(false);
    // restore
    await restoreCandidate(authedReq("POST", `http://x/api/candidates/${id}/restore`, token), ctx(id));
    const restored = await prisma.candidate.findUniqueOrThrow({ where: { id } });
    expect(restored.deletedAt).toBeNull();
    // a timeline event was recorded for the delete
    const ev = await prisma.candidateEvent.findMany({ where: { candidateId: id, type: "updated" } });
    expect(ev.length).toBeGreaterThan(0);
  });

  it("scheduling produces a real meeting link; reschedule + cancel work", async () => {
    const cand = await (await createCandidate(authedReq("POST", "http://x/api/candidates", token, { mode: "manual", fullName: `${P} Sched`, totalYears: 6, skills: [{ name: "React", years: 6 }] }))).json();
    const when = new Date(Date.now() + 5 * 86400000).toISOString();
    const res = await scheduleInterview(authedReq("POST", "http://x/api/interviews/schedule", token, { candidateId: cand.id, jobId, scheduledFor: when, meetingProvider: "google_meet" }));
    const json = await res.json();
    expect(json.meetingUrl).toMatch(/meet\.google\.com/);
    expect(json.reminders).toEqual(["24h", "1h", "10m"]);

    // reschedule
    const newWhen = new Date(Date.now() + 8 * 86400000).toISOString();
    const re = await rescheduleInterview(authedReq("PATCH", `http://x/api/interviews/${json.interviewId}`, token, { scheduledFor: newWhen }), ctx(json.interviewId));
    expect(re.status).toBe(200);
    const ivRe = await prisma.interview.findUniqueOrThrow({ where: { id: json.interviewId } });
    expect(ivRe.status).toBe("rescheduled");

    // cancel
    await cancelInterview(authedReq("DELETE", `http://x/api/interviews/${json.interviewId}`, token, { reason: "client unavailable" }), ctx(json.interviewId));
    const ivC = await prisma.interview.findUniqueOrThrow({ where: { id: json.interviewId } });
    expect(ivC.status).toBe("cancelled");
    expect(ivC.cancelReason).toBe("client unavailable");
  });

  it("import no longer zeroes skill years (Mission 5 data-bug fix)", async () => {
    const rows = [{ Name: `${P} Imported`, Email: "", Country: "Spain", Years: "8", Skills: "React, Node" }];
    await ingestRows(rows, { fullName: "Name", email: "Email", country: "Country", totalYears: "Years", skills: "Skills" }, { filename: "crud.csv" });
    const cand = await prisma.candidate.findFirstOrThrow({ where: { fullName: `${P} Imported` }, include: { skills: true } });
    expect(cand.skills.length).toBeGreaterThan(0);
    expect(cand.skills.every((s) => s.years > 0)).toBe(true);
  });
});
