import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { applyStage } from "@/lib/pipeline";
import { loadJobRow } from "@/lib/jobs";
import { runMatch, persistAnalyses } from "@/lib/matching/funnel";
import { handleWhatsAppInbound } from "@/lib/whatsapp/inbound";
import { ingestMeetingSummary } from "@/lib/meetings/ingest";
import { createMeetingTag } from "@/lib/meetings/provider";
import { resolveShareLink, createShareLink } from "@/lib/share";
import { scheduleInterviewReminders } from "@/lib/reminders";
import { processJobs } from "@/lib/queue/queue";
import { handlers } from "@/lib/queue/handlers";

const P = "ZZWA";
const CLIENT_NUMBER = "+12025550111";
let jobId = "";
let candA = ""; // submit + WhatsApp approve
let candB = ""; // schedule + TimeOS ingest + portal
let clientId = "";

async function ensureSkill(name: string) {
  return (await prisma.skill.upsert({ where: { canonicalName: name }, create: { canonicalName: name, synonyms: [] }, update: {} })).id;
}
async function cleanup() {
  await prisma.webhookEvent.deleteMany({ where: { externalId: { startsWith: "ZZWA" } } });
  await prisma.waMessage.deleteMany({ where: { OR: [{ toNumber: CLIENT_NUMBER }, { fromNumber: CLIENT_NUMBER }] } });
  await prisma.backgroundJob.deleteMany({ where: { type: { in: ["wa_send", "interview_reminder", "pending_feedback_reminder"] } } });
  await prisma.shareLink.deleteMany({ where: { job: { title: { startsWith: P } } } });
  await prisma.candidate.deleteMany({ where: { fullName: { startsWith: P } } });
  await prisma.job.deleteMany({ where: { title: { startsWith: P } } });
  await prisma.client.deleteMany({ where: { name: { startsWith: P } } });
}

describe("WhatsApp + TimeOS automation (DB)", () => {
  beforeAll(async () => {
    await cleanup();
    const reactId = await ensureSkill("React");
    const nodeId = await ensureSkill("Node.js");
    const client = await prisma.client.create({ data: { name: `${P}Client`, company: "ZZ Co", portalSlug: `zzwa-${Date.now()}`, whatsappNumber: CLIENT_NUMBER, email: "zzwa@client.example" } });
    clientId = client.id;
    const job = await prisma.job.create({ data: { clientId, title: `${P}Role`, budgetMax: 60, experienceYearsMin: 5, englishLevel: "B2+", skills: { create: [{ skillId: reactId, required: true, minYears: 4 }, { skillId: nodeId, required: true, minYears: 3 }] } } });
    jobId = job.id;
    const mk = async (name: string) => (await prisma.candidate.create({ data: { fullName: `${P} ${name}`, dedupeKey: `zzwa:${name}`, country: "Ukraine", englishLevel: "C1", clientRate: 34, careerStartYear: 2017, totalYears: 9, email: `${name.toLowerCase()}@zzwa.example`, aiSummary: `${name} is a strong senior engineer.`, skills: { create: [{ skillId: reactId, years: 6 }, { skillId: nodeId, years: 7 }] } } })).id;
    candA = await mk("Alpha");
    candB = await mk("Bravo");
    // Internal note on Alpha (must never reach WhatsApp/portal).
    await prisma.note.create({ data: { candidateId: candA, jobId, body: "INTERNAL-ZZ secret margin note", internal: true } });
    // Cache analyses so submitted messages carry a score.
    const jobRow = await loadJobRow(jobId);
    const results = await runMatch(jobRow!, { limit: 10 });
    await persistAnalyses(jobId, results);
  });
  afterAll(cleanup);

  it("Candidate Submitted: sent_to_client queues a WhatsApp message (no internal notes)", async () => {
    await applyStage({ candidateId: candA, jobId, to: "sent_to_client", actor: "recruiter" });
    const msg = await prisma.waMessage.findFirst({ where: { candidateId: candA, event: "candidate_submitted" } });
    expect(msg).not.toBeNull();
    expect(msg!.status).toBe("queued");
    expect(msg!.toNumber).toBe(CLIENT_NUMBER);
    expect(msg!.body).toContain(`${P} Alpha`);
    expect(msg!.body).not.toContain("INTERNAL-ZZ"); // no internal note leaks
    // Delivery is queued, not inline.
    const job = await prisma.backgroundJob.findFirst({ where: { type: "wa_send", status: "pending" } });
    expect(job).not.toBeNull();
  });

  it("the queue worker delivers the WhatsApp message (mock -> sent)", async () => {
    await processJobs(handlers, 50);
    const msg = await prisma.waMessage.findFirst({ where: { candidateId: candA, event: "candidate_submitted" } });
    expect(msg!.status).toBe("sent");
    expect(msg!.externalId).toMatch(/^mock-/);
  });

  it("approve from WhatsApp updates pipeline + submission + records inbound", async () => {
    const payload = { messages: [{ from: CLIENT_NUMBER, id: "ZZWA-approve-1", type: "button", button: { payload: `decision:approve:${candA}:${jobId}` } }] };
    const res = await handleWhatsAppInbound(payload, "1.2.3.4");
    expect(res.processed).toBe(1);
    expect(res.decisions[0]).toMatchObject({ decision: "approve", stage: "approved" });

    const pipe = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: candA, jobId } } });
    expect(pipe!.stage).toBe("approved");
    const sub = await prisma.submission.findUnique({ where: { jobId_candidateId: { jobId, candidateId: candA } } });
    expect(sub!.clientStatus).toBe("approved");
    const inbound = await prisma.waMessage.findFirst({ where: { direction: "inbound", externalId: "ZZWA-approve-1" } });
    expect(inbound).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { entityId: candA, action: "client_approve" } });
    expect(audit).not.toBeNull();
  });

  it("duplicate inbound WhatsApp webhook is ignored (idempotent)", async () => {
    const payload = { messages: [{ from: CLIENT_NUMBER, id: "ZZWA-approve-1", type: "button", button: { payload: `decision:approve:${candA}:${jobId}` } }] };
    const res = await handleWhatsAppInbound(payload, "1.2.3.4");
    expect(res.duplicates).toBe(1);
    expect(res.processed).toBe(0);
  });

  it("scheduling an interview enqueues reminders", async () => {
    const interview = await prisma.interview.create({ data: { candidateId: candB, jobId, scheduledFor: new Date(Date.now() + 7 * 86400000), provider: "mock", meetingTag: createMeetingTag(`zzwa-${candB}`), webhookStatus: "scheduled" } });
    const labels = await scheduleInterviewReminders(interview.id, interview.scheduledFor!);
    expect(labels).toEqual(["24h", "1h", "10m"]);
    const jobs = await prisma.backgroundJob.count({ where: { type: "interview_reminder" } });
    expect(jobs).toBeGreaterThanOrEqual(3);
  });

  it("TimeOS summary webhook attaches the interview and moves pipeline to screened", async () => {
    await applyStage({ candidateId: candB, jobId, to: "sent_to_client", actor: "recruiter" });
    const interview = await prisma.interview.findFirstOrThrow({ where: { candidateId: candB } });
    const summary = {
      meetingId: "ZZWA-meeting-1",
      tag: interview.meetingTag,
      recordingUrl: "https://rec.example/zzwa-1",
      transcript: "Full transcript text — internal only.",
      summary: "Strong communicator. Recommend client interview.",
      actionItems: ["Confirm availability", "Share portfolio"],
      participants: [{ name: "Bravo", email: "bravo@zzwa.example" }],
      meetingTime: new Date().toISOString(),
    };
    const result = await ingestMeetingSummary(summary);
    expect(result.status).toBe("processed");

    const updated = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
    expect(updated.recordingUrl).toBe("https://rec.example/zzwa-1");
    expect(updated.summary).toContain("Strong communicator");
    expect(updated.webhookStatus).toBe("summary_ready");

    const pipe = await prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: candB, jobId } } });
    expect(pipe!.stage).toBe("screened");

    // Screening-completed WhatsApp message queued for the client.
    const wa = await prisma.waMessage.findFirst({ where: { candidateId: candB, event: "screening_completed" } });
    expect(wa).not.toBeNull();
  });

  it("duplicate TimeOS summary webhook is ignored (idempotent)", async () => {
    const summary = { meetingId: "ZZWA-meeting-1", tag: null, summary: "again" };
    const result = await ingestMeetingSummary(summary);
    expect(result.status).toBe("duplicate");
  });

  it("client portal shows the video + summary but NEVER the transcript", async () => {
    const link = await createShareLink({ jobId, candidates: [{ candidateId: candB }] });
    const view = await resolveShareLink(link.token);
    const c = view.candidates.find((x) => x.id === candB)!;
    expect(c.interview?.recordingUrl).toBe("https://rec.example/zzwa-1");
    expect(c.interview?.summary).toContain("Strong communicator");
    // The transcript must not be present anywhere in the client-safe payload.
    expect(JSON.stringify(view)).not.toContain("Full transcript text");
    // And no internal-note / cost / anomaly leakage.
    expect((c as unknown as Record<string, unknown>).transcript).toBeUndefined();
  });
});
