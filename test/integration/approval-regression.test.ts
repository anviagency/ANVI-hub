import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { applyStage } from "@/lib/pipeline";
import { handleWhatsAppInbound } from "@/lib/whatsapp/inbound";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// Mission 5.1 P0 regression: the client MUST be able to approve after screening,
// the action MUST be idempotent, and the timeline MUST stay correct.
const P = "ZZAPPR";
const NUMBER = "+12025559999";
let jobId = "";
let candId = "";

async function cleanup() {
  await prisma.webhookEvent.deleteMany({ where: { externalId: { startsWith: "ZZAPPR" } } });
  await prisma.waMessage.deleteMany({ where: { fromNumber: NUMBER } });
  await cleanupByPrefix(P);
}

describe("approval-after-screening regression (Mission 5.1 P0)", () => {
  beforeAll(async () => {
    await cleanup();
    const clientId = await makeClient(P);
    // Give the client a whatsapp number that matches the inbound sender.
    await prisma.client.updateMany({ where: { id: clientId }, data: { whatsappNumber: NUMBER } });
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true }] });
    candId = await makeCandidate({ prefix: P, name: "Closer", skills: [{ name: "React", years: 6 }] });
    // Drive to the realistic state: sent_to_client -> screened.
    await applyStage({ candidateId: candId, jobId, to: "sent_to_client", actor: "recruiter" });
    await applyStage({ candidateId: candId, jobId, to: "screened", actor: "system" });
  });
  afterAll(cleanup);

  function approvePayload(msgId: string) {
    return { messages: [{ from: NUMBER, id: msgId, type: "button", button: { payload: `decision:approve:${candId}:${jobId}` } }] };
  }

  it("client approval SUCCEEDS when the candidate is at 'screened'", async () => {
    const pre = await prisma.pipeline.findUniqueOrThrow({ where: { candidateId_jobId: { candidateId: candId, jobId } } });
    expect(pre.stage).toBe("screened");

    const res = await handleWhatsAppInbound(approvePayload("ZZAPPR-1"), "1.2.3.4");
    expect(res.processed).toBe(1);
    expect(res.decisions[0]).toMatchObject({ decision: "approve", stage: "approved" });

    const pipe = await prisma.pipeline.findUniqueOrThrow({ where: { candidateId_jobId: { candidateId: candId, jobId } } });
    expect(pipe.stage).toBe("approved");
    const sub = await prisma.submission.findUnique({ where: { jobId_candidateId: { jobId, candidateId: candId } } });
    expect(sub?.clientStatus).toBe("approved");
    const ev = await prisma.candidateEvent.findMany({ where: { candidateId: candId, type: "client_approved" } });
    expect(ev.length).toBe(1); // exactly one timeline event
  });

  it("a duplicate provider message is ignored (idempotent at the webhook layer)", async () => {
    const res = await handleWhatsAppInbound(approvePayload("ZZAPPR-1"), "1.2.3.4");
    expect(res.duplicates).toBe(1);
    expect(res.processed).toBe(0);
  });

  it("a fresh approve of an already-approved candidate is a safe no-op (idempotent decision)", async () => {
    const res = await handleWhatsAppInbound(approvePayload("ZZAPPR-2"), "1.2.3.4");
    expect(res.processed).toBe(1);
    expect(res.decisions[0]).toMatchObject({ decision: "approve", stage: "approved" });
    // Still exactly one client_approved event — no timeline duplication.
    const ev = await prisma.candidateEvent.findMany({ where: { candidateId: candId, type: "client_approved" } });
    expect(ev.length).toBe(1);
  });

  it("approved candidate can be moved to hired (placement path opens)", async () => {
    await applyStage({ candidateId: candId, jobId, to: "hired", actor: "recruiter" });
    const pipe = await prisma.pipeline.findUniqueOrThrow({ where: { candidateId_jobId: { candidateId: candId, jobId } } });
    expect(pipe.stage).toBe("hired");
    const placement = await prisma.placement.findFirst({ where: { candidateId: candId, jobId } });
    expect(placement).not.toBeNull();
  });
});
