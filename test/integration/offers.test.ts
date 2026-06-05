import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { applyStage } from "@/lib/pipeline";
import { createOffer, respondToOffer, OfferError } from "@/lib/offers";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// Offer + placement: the tail that closes the funnel (spec §8 / Definition of Done).
// approval/interview → offer extended → accepted → hired → placement (with start date).
const P = "ZZOFFER";
let clientId = "";
let jobId = "";
let candId = "";

async function cleanup() {
  await cleanupByPrefix(P);
}

describe("offers close the funnel (spec §8)", () => {
  beforeAll(async () => {
    await cleanup();
    clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true }] });
    candId = await makeCandidate({ prefix: P, name: "Closer", clientRate: 55, salaryExpectation: 40, skills: [{ name: "React", years: 6 }] });
  });
  afterAll(cleanup);

  it("refuses to offer a candidate who hasn't reached the client", async () => {
    await expect(createOffer({ candidateId: candId, jobId })).rejects.toMatchObject({
      name: "OfferError",
      code: "invalid_transition",
    });
    const offers = await prisma.offer.count({ where: { candidateId: candId, jobId } });
    expect(offers).toBe(0); // no orphaned offer persisted
  });

  it("extends an offer once the candidate is approved (moves pipeline → offer)", async () => {
    await applyStage({ candidateId: candId, jobId, to: "sent_to_client", actor: "recruiter" });
    await applyStage({ candidateId: candId, jobId, to: "approved", actor: "client" });

    const startDate = new Date("2026-07-01T09:00:00.000Z");
    const offer = await createOffer({ candidateId: candId, jobId, clientRate: 60, startDate });

    expect(offer.status).toBe("sent");
    expect(offer.clientRate).toBe(60);
    // Internal salary is snapshotted from the candidate (never exposed to clients).
    expect(offer.salary).toBe(40);

    const pipe = await prisma.pipeline.findUniqueOrThrow({ where: { candidateId_jobId: { candidateId: candId, jobId } } });
    expect(pipe.stage).toBe("offer");

    const ev = await prisma.candidateEvent.findMany({ where: { candidateId: candId, type: "offer_extended" } });
    expect(ev.length).toBe(1);
  });

  it("rejects a second open offer for the same candidate/job", async () => {
    await expect(createOffer({ candidateId: candId, jobId })).rejects.toMatchObject({ code: "open_offer_exists" });
  });

  it("accepting an offer hires the candidate and creates a placement from the offer terms", async () => {
    const offer = await prisma.offer.findFirstOrThrow({ where: { candidateId: candId, jobId, status: "sent" } });
    const res = await respondToOffer({ offerId: offer.id, to: "accepted" });

    expect(res.offer.status).toBe("accepted");
    expect(res.offer.respondedAt).not.toBeNull();
    expect(res.placementId).not.toBeNull();

    const pipe = await prisma.pipeline.findUniqueOrThrow({ where: { candidateId_jobId: { candidateId: candId, jobId } } });
    expect(pipe.stage).toBe("hired");

    const placement = await prisma.placement.findFirstOrThrow({ where: { candidateId: candId, jobId } });
    // Offer-aware: placement inherits the offer's start date and client rate.
    expect(placement.offerId).toBe(offer.id);
    expect(placement.clientRate).toBe(60);
    expect(placement.startDate?.toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(placement.status).toBe("active");
    expect(placement.onboardingStatus).toBe("pending");

    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: candId } });
    expect(cand.availability).toBe("placed");
  });

  it("does not duplicate the placement if hired is applied again (idempotent)", async () => {
    await applyStage({ candidateId: candId, jobId, to: "hired", actor: "recruiter" });
    const placements = await prisma.placement.count({ where: { candidateId: candId, jobId } });
    expect(placements).toBe(1);
  });

  it("the placement record carries no internal salary field (cost stays internal)", async () => {
    const placement = await prisma.placement.findFirstOrThrow({ where: { candidateId: candId, jobId } });
    // Structural guard: Placement exposes clientRate (price), never salary (cost).
    expect(Object.prototype.hasOwnProperty.call(placement, "salary")).toBe(false);
    expect(placement).toHaveProperty("clientRate");
  });
});

describe("offer decline path", () => {
  const D = "ZZOFFD";
  let dJob = "";
  let dCand = "";
  beforeAll(async () => {
    await cleanupByPrefix(D);
    const c = await makeClient(D);
    dJob = await makeJob({ prefix: D, clientId: c, skills: [{ name: "Go", required: true }] });
    dCand = await makeCandidate({ prefix: D, name: "Passer", skills: [{ name: "Go", years: 4 }] });
    await applyStage({ candidateId: dCand, jobId: dJob, to: "sent_to_client", actor: "recruiter" });
    await applyStage({ candidateId: dCand, jobId: dJob, to: "interview", actor: "recruiter" });
  });
  afterAll(async () => {
    await cleanupByPrefix(D);
  });

  it("records the decline reason and creates no placement", async () => {
    const offer = await createOffer({ candidateId: dCand, jobId: dJob });
    const res = await respondToOffer({ offerId: offer.id, to: "declined", declineReason: "Accepted a competing offer" });

    expect(res.offer.status).toBe("declined");
    expect(res.offer.declineReason).toBe("Accepted a competing offer");
    expect(res.placementId).toBeNull();

    const placements = await prisma.placement.count({ where: { candidateId: dCand, jobId: dJob } });
    expect(placements).toBe(0);

    const ev = await prisma.candidateEvent.findMany({ where: { candidateId: dCand, type: "offer_declined" } });
    expect(ev.length).toBe(1);
  });

  it("rejects an illegal transition (accept after terminal decline) via OfferError", async () => {
    const offer = await prisma.offer.findFirstOrThrow({ where: { candidateId: dCand, jobId: dJob } });
    await expect(respondToOffer({ offerId: offer.id, to: "accepted" })).rejects.toBeInstanceOf(OfferError);
  });
});
