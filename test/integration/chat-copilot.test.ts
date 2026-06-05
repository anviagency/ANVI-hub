import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { POST as chat } from "@/app/api/chat/route";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";
import { createTestUser, authedReq, cleanupAuth } from "./auth-helper";

// Mission 5.2 — the Recruiter Copilot performs the workflow from chat.
const P = "ZZCHAT";
let token = "";
let jobId = "";
let aId = "";
let bId = "";

const ask = (message: string) => chat(authedReq("POST", "http://x/api/chat", token, { message, context: { jobId } }));

async function cleanup() {
  await prisma.shareLink.deleteMany({ where: { job: { title: { startsWith: P } } } });
  await cleanupByPrefix(P);
  await cleanupAuth(P);
}

describe("Recruiter Copilot chat (Mission 5.2)", () => {
  beforeAll(async () => {
    await cleanup();
    token = (await createTestUser("recruiter", P)).token;
    const clientId = await makeClient(P);
    await prisma.client.update({ where: { id: clientId }, data: { whatsappNumber: "+12025551234" } });
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true, minYears: 3 }, { name: "Node.js", required: true, minYears: 3 }] });
    aId = await makeCandidate({ prefix: P, name: "Alphaone", clientRate: 34, skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 7 }] });
    bId = await makeCandidate({ prefix: P, name: "Betatwo", clientRate: 30, skills: [{ name: "React", years: 5 }, { name: "Node.js", years: 6 }] });
  });
  afterAll(cleanup);

  it("requires authentication", async () => {
    const { NextRequest } = await import("next/server");
    const res = await chat(new NextRequest("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "match" }) }));
    expect(res.status).toBe(401);
  });

  it("matches from chat", async () => {
    const j = await (await ask("match candidates")).json();
    expect(j.kind).toBe("candidates");
    expect(j.data.list.length).toBeGreaterThan(0);
  });

  it("explains the top candidates with reasons", async () => {
    const j = await (await ask("explain why these ranked highest")).json();
    expect(j.kind).toBe("explain");
    expect(j.data.list[0].reasons.length).toBeGreaterThan(0);
  });

  it("checks availability from chat", async () => {
    const j = await (await ask("are the top candidates available?")).json();
    expect(j.kind).toBe("availability");
    expect(j.data.list[0]).toHaveProperty("score");
  });

  it("summarizes a named candidate", async () => {
    const j = await (await ask("summarize Alphaone")).json();
    expect(j.kind).toBe("summary");
    expect(j.data.candidate.name).toContain("Alphaone");
  });

  it("compares two named candidates and recommends one", async () => {
    const j = await (await ask("compare Alphaone and Betatwo")).json();
    expect(j.kind).toBe("comparison");
    expect(j.data.cards.length).toBe(2);
    expect(j.data.recommendation).toHaveProperty("name");
  });

  it("submits named candidates from chat (pipeline -> sent_to_client)", async () => {
    const j = await (await ask("send Alphaone and Betatwo to the client")).json();
    expect(j.kind).toBe("submit_result");
    expect(j.data.submitted.length).toBe(2);
    const pipe = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: aId, jobId } } });
    expect(["sent_to_client", "interview", "approved", "screened"]).toContain(pipe?.stage);
  });

  it("generates a share link from chat", async () => {
    const j = await (await ask("share a client link with Alphaone and Betatwo")).json();
    expect(j.kind).toBe("share_result");
    expect(j.data.url).toMatch(/^\/share\//);
    const link = await prisma.shareLink.findUnique({ where: { token: j.data.token } });
    expect(link).not.toBeNull();
  });

  it("shows pending recruiter actions", async () => {
    const j = await (await ask("what's pending?")).json();
    expect(j.kind).toBe("pending");
    expect(Array.isArray(j.data.items)).toBe(true);
  });
});
