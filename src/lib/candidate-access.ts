import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notify";
import { meetingsConfigured } from "@/lib/meetings/provider";
import type { Availability } from "@prisma/client";

// Candidate micro-surface (Mission 8 Phase 3). A secure, tokenized, login-free
// link that lets a candidate self-confirm availability and respond to an
// interview invite. Token-authorized only. Pure service logic split from routes.

const DEFAULT_TTL_DAYS = 30;

export function generateAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

export type CandidateAccessErrorCode = "not_found" | "expired" | "candidate_not_found" | "no_interview";
export class CandidateAccessError extends Error {
  constructor(public code: CandidateAccessErrorCode) {
    super(code);
    this.name = "CandidateAccessError";
  }
}

export async function createCandidateAccess(opts: { candidateId: string; jobId?: string | null; createdById?: string | null; expiresAt?: Date | null }) {
  const candidate = await prisma.candidate.findUnique({ where: { id: opts.candidateId } });
  if (!candidate) throw new CandidateAccessError("candidate_not_found");
  const token = generateAccessToken();
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_DAYS * 86400000);
  return prisma.candidateAccess.create({
    data: { token, candidateId: opts.candidateId, jobId: opts.jobId ?? null, createdById: opts.createdById ?? null, expiresAt },
  });
}

export interface CandidateSelfView {
  candidate: { name: string; availability: string; availabilityNote: string | null; availabilityConfirmedAt: string | null };
  job: { title: string } | null;
  interview: {
    id: string;
    status: string;
    scheduledFor: string | null;
    timezone: string | null;
    proposedSlots: string[];
    meetingUrl: string | null;
    candidateStatus: string;
  } | null;
}

async function loadLink(token: string) {
  const link = await prisma.candidateAccess.findUnique({ where: { token } });
  if (!link) throw new CandidateAccessError("not_found");
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new CandidateAccessError("expired");
  return link;
}

/** Resolve a candidate token into the candidate's own, minimal self-service view. */
export async function resolveCandidateAccess(token: string): Promise<CandidateSelfView> {
  const link = await loadLink(token);
  void prisma.candidateAccess.update({ where: { id: link.id }, data: { lastViewedAt: new Date() } }).catch(() => {});

  const candidate = await prisma.candidate.findUnique({ where: { id: link.candidateId } });
  if (!candidate) throw new CandidateAccessError("candidate_not_found");
  const job = link.jobId ? await prisma.job.findUnique({ where: { id: link.jobId }, select: { title: true } }) : null;

  const interview = await prisma.interview.findFirst({
    where: { candidateId: link.candidateId, ...(link.jobId ? { jobId: link.jobId } : {}), status: { in: ["proposed", "scheduled", "rescheduled"] } },
    orderBy: { createdAt: "desc" },
  });

  return {
    candidate: {
      name: candidate.fullName,
      availability: candidate.availability,
      availabilityNote: candidate.availabilityNote,
      availabilityConfirmedAt: candidate.availabilityConfirmedAt?.toISOString() ?? null,
    },
    job: job ? { title: job.title } : null,
    interview: interview
      ? {
          id: interview.id,
          status: interview.status,
          scheduledFor: interview.scheduledFor?.toISOString() ?? null,
          timezone: interview.timezone,
          proposedSlots: Array.isArray(interview.proposedSlots) ? (interview.proposedSlots as string[]) : [],
          // Never show a fake join link to the candidate either (Phase 1).
          meetingUrl: interview.meetingProvisioned && interview.meetingUrl ? interview.meetingUrl : null,
          candidateStatus: interview.candidateStatus,
        }
      : null,
  };
}

export type CandidateAction = "confirm_availability" | "decline_availability" | "confirm_interview" | "request_reschedule";

export interface CandidateActionResult {
  action: CandidateAction;
  availability?: string;
  interviewStatus?: string;
}

/** Apply a candidate's self-service action; feeds profile, availability score,
 * recruiter notifications, and the timeline. */
export async function recordCandidateAction(token: string, action: CandidateAction, message?: string, ip?: string): Promise<CandidateActionResult> {
  const link = await loadLink(token);
  const candidate = await prisma.candidate.findUnique({ where: { id: link.candidateId } });
  if (!candidate) throw new CandidateAccessError("candidate_not_found");
  const now = new Date();

  if (action === "confirm_availability" || action === "decline_availability") {
    const availability: Availability = action === "confirm_availability" ? "available" : "on_hold";
    await prisma.candidate.update({
      where: { id: candidate.id },
      // availabilityConfirmedAt is set in BOTH cases: the candidate has given a
      // fresh, explicit signal (it drives the freshness/availability score).
      data: { availability, availabilityConfirmedAt: now, lastContactedAt: now },
    });
    await prisma.candidateEvent.create({
      data: { candidateId: candidate.id, jobId: link.jobId, type: action === "confirm_availability" ? "availability_confirmed" : "availability_declined", actor: "candidate", meta: { via: "candidate_link", message: message ?? null } },
    });
    await notify({
      channel: "recruiter",
      title: `${candidate.fullName} ${action === "confirm_availability" ? "confirmed availability" : "is not available"}`,
      body: action === "confirm_availability" ? `${candidate.fullName} confirmed they are available.` : `${candidate.fullName} declined — marked on hold.${message ? ` Note: ${message}` : ""}`,
      candidateId: candidate.id,
      jobId: link.jobId,
    });
    return { action, availability };
  }

  // Interview-response actions require an active interview.
  const interview = await prisma.interview.findFirst({
    where: { candidateId: candidate.id, ...(link.jobId ? { jobId: link.jobId } : {}), status: { in: ["proposed", "scheduled", "rescheduled"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!interview) throw new CandidateAccessError("no_interview");

  if (action === "confirm_interview") {
    await prisma.interview.update({ where: { id: interview.id }, data: { candidateStatus: "confirmed", candidateRespondedAt: now } });
    await prisma.candidateEvent.create({
      data: { candidateId: candidate.id, jobId: interview.jobId, type: "candidate_confirmed_interview", actor: "candidate", meta: { interviewId: interview.id } },
    });
    await notify({ channel: "recruiter", title: `${candidate.fullName} confirmed the interview`, body: `${candidate.fullName} confirmed the interview${interview.scheduledFor ? ` for ${interview.scheduledFor.toISOString()}` : ""}.`, candidateId: candidate.id, jobId: interview.jobId });
    return { action, interviewStatus: "confirmed" };
  }

  // request_reschedule
  await prisma.interview.update({ where: { id: interview.id }, data: { candidateStatus: "reschedule_requested", candidateMessage: message ?? null, candidateRespondedAt: now } });
  await prisma.candidateEvent.create({
    data: { candidateId: candidate.id, jobId: interview.jobId, type: "candidate_reschedule_requested", actor: "candidate", meta: { interviewId: interview.id, message: message ?? null } },
  });
  await notify({ channel: "recruiter", title: `${candidate.fullName} requested another interview time`, body: `${candidate.fullName} asked to reschedule.${message ? ` Note: ${message}` : ""}`, candidateId: candidate.id, jobId: interview.jobId });
  return { action, interviewStatus: "reschedule_requested" };
}

/** Exposed for surfaces that want to note whether recordings are live (parity with share). */
export function recordingsLive(): boolean {
  return meetingsConfigured();
}
