import { prisma } from "@/lib/db";
import { enqueueWhatsApp } from "@/lib/whatsapp/messages";
import { meetingsConfigured } from "@/lib/meetings/provider";

// WhatsApp event map (Mission 4 Part 2). Each function builds the client-safe
// body + interactive buttons for a lifecycle event and enqueues delivery.
// Callback ids encode the action so the inbound handler can route them:
//   decision:<approve|reject|request_interview>:<candidateId>:<jobId>
//   view:<candidateId>:<jobId> | watch:<interviewId> | summary:<interviewId> | schedule:<candidateId>:<jobId>

function decisionButtons(candidateId: string, jobId: string) {
  return [
    { id: `decision:approve:${candidateId}:${jobId}`, title: "Approve" },
    { id: `decision:reject:${candidateId}:${jobId}`, title: "Reject" },
    { id: `decision:request_interview:${candidateId}:${jobId}`, title: "Interview" },
  ];
}

/** "Candidate Submitted" — sent to the client when a candidate reaches sent_to_client. */
export async function notifyCandidateSubmitted(candidateId: string, jobId: string): Promise<string | null> {
  const [candidate, job] = await Promise.all([
    prisma.candidate.findUnique({ where: { id: candidateId } }),
    prisma.job.findUnique({ where: { id: jobId }, include: { client: true } }),
  ]);
  if (!candidate || !job) return null;
  const analysis = await prisma.candidateAnalysis.findUnique({ where: { candidateId_jobId: { candidateId, jobId } } });
  const score = analysis ? `${Math.round(analysis.matchScore)}%` : "—";
  // Client-safe summary only. No internal notes, no cost, no raw anomalies.
  const summary = (candidate.aiSummary ?? "").slice(0, 200);

  const body = [
    `🎉 New candidate submitted: ${candidate.fullName}`,
    `Position: ${job.title}`,
    [candidate.country, candidate.clientRate != null ? `$${candidate.clientRate}/hr` : null, `Match: ${score}`].filter(Boolean).join(" · "),
    summary ? `\n${summary}` : "",
  ].filter(Boolean).join("\n");

  return enqueueWhatsApp({
    toNumber: job.client?.whatsappNumber ?? null,
    clientId: job.clientId, candidateId, jobId,
    event: "candidate_submitted", kind: "interactive", body,
    buttons: decisionButtons(candidateId, jobId),
  });
}

/** "Screening Completed" — sent when an interview summary/video is attached. */
export async function notifyScreeningCompleted(interviewId: string): Promise<string | null> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: true, job: { include: { client: true } } },
  });
  if (!interview || !interview.job) return null;
  const c = interview.candidate;
  const analysis = await prisma.candidateAnalysis.findUnique({ where: { candidateId_jobId: { candidateId: c.id, jobId: interview.job.id } } });
  const rec = analysis ? analysis.recommendation : "possible";

  // Only surface a recording link when a real provider produced it; never a mock.
  const recordingLine = meetingsConfigured() && interview.recordingUrl
    ? `Recording: ${interview.recordingUrl}`
    : "Recording will be available shortly.";

  const body = [
    `✅ Screening completed for ${c.fullName}.`,
    `AI recommendation: ${rec === "strong" ? "Strong match" : rec === "weak" ? "Weak match" : "Possible match"}.`,
    recordingLine,
    interview.summary ? `\nSummary: ${interview.summary.slice(0, 200)}` : "",
  ].filter(Boolean).join("\n");

  return enqueueWhatsApp({
    toNumber: interview.job.client?.whatsappNumber ?? null,
    clientId: interview.job.clientId, candidateId: c.id, jobId: interview.job.id,
    event: "screening_completed", kind: "interactive", body,
    buttons: [
      { id: `decision:request_interview:${c.id}:${interview.job.id}`, title: "Schedule" },
      { id: `decision:approve:${c.id}:${interview.job.id}`, title: "Approve" },
      { id: `decision:reject:${c.id}:${interview.job.id}`, title: "Reject" },
    ],
  });
}

/** "Pending Feedback Reminder" — N candidates awaiting the client's decision. */
export async function notifyPendingFeedback(clientId: string, jobId: string): Promise<string | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;
  const pending = await prisma.submission.findMany({
    where: { clientId, jobId, clientStatus: "pending" },
    include: { candidate: true },
  });
  if (pending.length === 0) return null;

  const names = pending.map((p) => p.candidate.fullName).slice(0, 5).join(", ");
  const body = `⏳ You have ${pending.length} candidate${pending.length === 1 ? "" : "s"} waiting for your feedback: ${names}.`;

  // One representative decision target; the "Review" button opens the portal.
  const first = pending[0];
  return enqueueWhatsApp({
    toNumber: client.whatsappNumber ?? null,
    clientId, jobId,
    event: "pending_feedback", kind: "interactive", body,
    buttons: [
      { id: `view:${first.candidateId}:${jobId}`, title: "Review" },
      { id: `decision:approve:${first.candidateId}:${jobId}`, title: "Approve" },
      { id: `decision:reject:${first.candidateId}:${jobId}`, title: "Reject" },
    ],
  });
}

/** Interview reminder (24h / 1h / 10m before). */
export async function notifyInterviewReminder(interviewId: string, label: string): Promise<string | null> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: true, job: { include: { client: true } } },
  });
  if (!interview || !interview.job) return null;
  const when = interview.scheduledFor ? interview.scheduledFor.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "soon";
  const body = `🔔 Interview reminder (${label}): ${interview.candidate.fullName} for ${interview.job.title} at ${when}.`;
  return enqueueWhatsApp({
    toNumber: interview.job.client?.whatsappNumber ?? null,
    clientId: interview.job.clientId, candidateId: interview.candidate.id, jobId: interview.job.id,
    event: "interview_reminder", kind: "text", body,
  });
}
