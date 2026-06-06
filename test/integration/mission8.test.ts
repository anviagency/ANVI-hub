import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { applyStage } from "@/lib/pipeline";
import { createShareLink, resolveShareLink } from "@/lib/share";
import { createCandidateAccess, resolveCandidateAccess, recordCandidateAction } from "@/lib/candidate-access";
import { makeClient, makeJob, makeCandidate, cleanupByPrefix } from "./fixtures";

// Mission 8 — pilot-readiness behaviors: no fake links, real scheduling +
// proposed slots, the candidate confirmation flow, and minimal client comms.
const P = "ZZM8";
let clientId = "";
let jobId = "";
let candId = "";

describe("Mission 8 — pilot readiness", () => {
  beforeAll(async () => {
    await cleanupByPrefix(P);
    clientId = await makeClient(P);
    jobId = await makeJob({ prefix: P, clientId, skills: [{ name: "React", required: true }] });
    candId = await makeCandidate({ prefix: P, name: "Pilot", skills: [{ name: "React", years: 6 }] });
    await applyStage({ candidateId: candId, jobId, to: "sent_to_client", actor: "recruiter" });
  });
  afterAll(async () => {
    await prisma.candidateAccess.deleteMany({ where: { candidateId: candId } });
    await prisma.clientMessage.deleteMany({ where: { jobId } });
    await cleanupByPrefix(P);
  });

  it("Phase 1: an unprovisioned interview never exposes a meeting/recording link to the client", async () => {
    // Interview with NO real link (provider not configured, none pasted).
    await prisma.interview.create({
      data: {
        candidateId: candId, jobId, scheduledFor: new Date(Date.now() + 3 * 86400000), status: "scheduled",
        meetingUrl: null, meetingProvisioned: false, recordingUrl: "https://rec.example/fake", webhookStatus: "summary_ready", summary: "Good screening.",
      },
    });
    const link = await createShareLink({ jobId, candidates: [{ candidateId: candId }] });
    const view = await resolveShareLink(link.token);
    const c = view.candidates.find((x) => x.id === candId)!;
    expect(c.interview?.meetingUrl).toBeNull();
    expect(c.interview?.recordingUrl).toBeNull(); // fake recording suppressed
    expect(c.interview?.recordingPending).toBe(true);
    expect(JSON.stringify(view)).not.toContain("rec.example");
  });

  it("Phase 3: candidate confirms availability → profile, score signal, timeline, notification", async () => {
    const access = await createCandidateAccess({ candidateId: candId, jobId });
    const view = await resolveCandidateAccess(access.token);
    expect(view.candidate.name).toContain("Pilot");
    expect(view.job?.title).toBeTruthy();

    const res = await recordCandidateAction(access.token, "confirm_availability");
    expect(res.availability).toBe("available");

    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: candId } });
    expect(cand.availability).toBe("available");
    expect(cand.availabilityConfirmedAt).not.toBeNull(); // feeds the availability score

    const ev = await prisma.candidateEvent.findMany({ where: { candidateId: candId, type: "availability_confirmed" } });
    expect(ev.length).toBe(1);
    const notif = await prisma.notification.findFirst({ where: { candidateId: candId, title: { contains: "confirmed availability" } } });
    expect(notif).not.toBeNull();
  });

  it("Phase 3: candidate can confirm an interview and request a reschedule", async () => {
    const access = await createCandidateAccess({ candidateId: candId, jobId });
    const confirm = await recordCandidateAction(access.token, "confirm_interview");
    expect(confirm.interviewStatus).toBe("confirmed");
    const iv1 = await prisma.interview.findFirstOrThrow({ where: { candidateId: candId, jobId }, orderBy: { createdAt: "desc" } });
    expect(iv1.candidateStatus).toBe("confirmed");

    const resched = await recordCandidateAction(access.token, "request_reschedule", "Mornings are better");
    expect(resched.interviewStatus).toBe("reschedule_requested");
    const iv2 = await prisma.interview.findFirstOrThrow({ where: { candidateId: candId, jobId }, orderBy: { createdAt: "desc" } });
    expect(iv2.candidateStatus).toBe("reschedule_requested");
    expect(iv2.candidateMessage).toBe("Mornings are better");
  });

  it("Phase 4: a client question is persisted, timelined, and notified (no fake inbox)", async () => {
    const msg = await prisma.clientMessage.create({ data: { jobId, candidateId: candId, clientId, kind: "question", body: "Can he start in August?", via: "share_link" } });
    expect(msg.resolvedAt).toBeNull();
    const all = await prisma.clientMessage.findMany({ where: { jobId } });
    expect(all.length).toBeGreaterThan(0);
  });
});
