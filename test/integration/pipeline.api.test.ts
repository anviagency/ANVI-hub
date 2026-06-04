import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { GET, POST } from "@/app/api/pipeline/route";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

const P = "ZZPIPE";
let jobId = "";
let candId = "";
let otherId = "";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/pipeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getReq(qs: string) {
  return new NextRequest(`http://localhost/api/pipeline?${qs}`);
}

describe("pipeline API (DB)", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    const clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true }] });
    candId = await makeCandidate({ prefix: P, name: "Alpha", country: "Poland", clientRate: 30, skills: [{ name: "React", years: 5 }] });
    otherId = await makeCandidate({ prefix: P, name: "Beta", country: "Ukraine", clientRate: 50, skills: [{ name: "React", years: 4 }] });
  });
  afterAll(() => cleanupByPrefix(P));

  it("moves a candidate through a valid transition and records event + notification", async () => {
    const res = await POST(postReq({ candidateId: candId, jobId, stage: "screened" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.to).toBe("screened");

    const row = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: candId, jobId } } });
    expect(row?.stage).toBe("screened");

    const events = await prisma.candidateEvent.findMany({ where: { candidateId: candId, type: "stage_changed" } });
    expect(events.length).toBeGreaterThan(0);

    const notes = await prisma.notification.findMany({ where: { candidateId: candId } });
    expect(notes.length).toBeGreaterThan(0); // recruiter + telegram(skipped)
  });

  it("creates a Submission when reaching sent_to_client", async () => {
    await POST(postReq({ candidateId: candId, jobId, stage: "sent_to_client" }));
    const sub = await prisma.submission.findUnique({ where: { jobId_candidateId: { jobId, candidateId: candId } } });
    expect(sub).not.toBeNull();
    expect(sub!.clientStatus).toBe("pending");
  });

  it("rejects an illegal transition with 409", async () => {
    // Beta starts at 'new'; new -> hired is illegal.
    await POST(postReq({ candidateId: otherId, jobId, stage: "new" }));
    const res = await POST(postReq({ candidateId: otherId, jobId, stage: "hired" }));
    expect(res.status).toBe(409);
  });

  it("filters the board by jobId and country", async () => {
    const res = await GET(getReq(`jobId=${jobId}&country=Poland`));
    const json = await res.json();
    const names = json.entries.map((e: { candidate: { name: string } }) => e.candidate.name);
    expect(names).toContain(`${P} Alpha`);
    expect(names).not.toContain(`${P} Beta`); // Beta is Ukraine
  });

  it("rejects an unknown stage with 400", async () => {
    const res = await POST(postReq({ candidateId: candId, jobId, stage: "bogus" }));
    expect(res.status).toBe(400);
  });
});
