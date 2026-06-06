import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { loadJobRow } from "@/lib/jobs";
import { toCandidateInput, toJobRequirement } from "@/lib/matching/funnel";
import { detectAnomalies } from "@/lib/matching/anomaly";
import { analyzeCandidate } from "@/lib/matching/scoring";
import { STAGE_LABEL } from "@/lib/pipeline";
import { notify } from "@/lib/notify";
import { getFreshAnalysis } from "@/lib/matching/cache";
import { meetingsConfigured } from "@/lib/meetings/provider";
import { applyClientDecision, type ClientDecision } from "@/lib/decisions";
import type { PipelineStage } from "@prisma/client";
import type { Risk, Strength } from "@/lib/types";

// Client share links (mission item 3). A recruiter mints a secure, scoped link
// for a job; the client sees ONLY the selected candidates and ONLY client-safe
// fields. Internal notes and raw anomalies never cross the boundary unless the
// recruiter explicitly opted a candidate's notes in (shareNotes).

export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface CreateShareInput {
  jobId: string;
  clientId?: string | null;
  label?: string | null;
  expiresAt?: Date | null;
  createdById?: string | null;
  candidates: { candidateId: string; shareNotes?: boolean }[];
}

// Share links expire by default (Mission 3.5 P1) — a forwarded link must not be
// a permanent data window. Override with an explicit expiresAt.
const DEFAULT_SHARE_TTL_DAYS = 30;

export async function createShareLink(input: CreateShareInput) {
  const job = await prisma.job.findUnique({ where: { id: input.jobId } });
  if (!job) throw new ShareError("job_not_found");

  const token = generateToken();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + DEFAULT_SHARE_TTL_DAYS * 86400000);
  const link = await prisma.shareLink.create({
    data: {
      token,
      jobId: input.jobId,
      clientId: input.clientId ?? job.clientId ?? null,
      label: input.label ?? null,
      expiresAt,
      createdById: input.createdById ?? null,
      candidates: {
        create: input.candidates.map((c) => ({
          candidateId: c.candidateId,
          shareNotes: c.shareNotes ?? false,
        })),
      },
    },
    include: { candidates: true },
  });

  // Timeline: mark each candidate as shared on this job.
  await Promise.all(
    input.candidates.map((c) =>
      prisma.candidateEvent.create({
        data: { candidateId: c.candidateId, jobId: input.jobId, type: "shared", actor: "recruiter", meta: { token } },
      })
    )
  );

  await notify({
    channel: "recruiter",
    title: "Share link created",
    body: `Shared ${input.candidates.length} candidate(s) for ${job.title}.`,
    jobId: input.jobId,
  });

  return link;
}

export type ShareErrorCode = "not_found" | "revoked" | "expired" | "job_not_found" | "candidate_not_shared";
export class ShareError extends Error {
  constructor(public code: ShareErrorCode) {
    super(code);
    this.name = "ShareError";
  }
}

interface ResolvedShareLink {
  token: string;
  label: string | null;
  job: { id: string; title: string; seniority: string | null };
  client: { name: string; company: string | null } | null;
  candidates: ClientSafeCandidate[];
}

export interface ClientSafeCandidate {
  id: string;
  name: string;
  title: string | null;
  country: string | null;
  english: string | null;
  availability: string;
  availabilityNote: string | null;
  rate: number | null; // hourly price shown to client
  skills: string[];
  summary: string | null;
  matchScore: number;
  recommendation: string;
  strengths: Strength[];
  risks: Risk[]; // curated risks (NOT raw anomalies)
  sharedNotes: { kind: string; body: string; createdAt: Date }[]; // only if shareNotes
  clientStatus: string; // pending/approved/rejected
  stage: string; // friendly pipeline stage label
  // Client-safe interview info (video + summary + action items + scheduled meeting; NEVER transcript).
  // recordingUrl / meetingUrl are ONLY ever real links: a fake/unprovisioned link is
  // suppressed and surfaced as a status flag instead (Mission 8 Phase 1 — no fake links).
  interview: {
    recordingUrl: string | null;
    recordingPending: boolean;
    summary: string | null;
    actionItems: unknown;
    completedAt: Date | null;
    scheduledFor: Date | null;
    proposedSlots: string[];
    meetingUrl: string | null;
    meetingPending: boolean;
    status: string;
  } | null;
}

/** Validate a token and project everything the client is allowed to see. */
export async function resolveShareLink(token: string): Promise<ResolvedShareLink> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      job: true,
      client: true,
      candidates: true,
    },
  });
  if (!link) throw new ShareError("not_found");
  if (link.revoked) throw new ShareError("revoked");
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new ShareError("expired");

  // Track views (best-effort, non-blocking) for the audit trail.
  void prisma.shareLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => {});

  const jobRow = await loadJobRow(link.jobId);
  const jobMeta = await prisma.job.findUnique({ where: { id: link.jobId }, select: { updatedAt: true } });
  const currentYear = new Date().getUTCFullYear();

  const candidates: ClientSafeCandidate[] = [];
  for (const slc of link.candidates) {
    const row = await prisma.candidate.findUnique({
      where: { id: slc.candidateId },
      include: { skills: { include: { skill: true } }, employments: true },
    });
    if (!row) continue;

    const input = toCandidateInput(row);
    const anomalies = detectAnomalies(input, { currentYear });
    // Prefer the candidate_analysis cache when fresh (Mission 3.5 P2).
    let analysis: { matchScore: number; recommendation: string; strengths: Strength[]; risks: Risk[] } | null = null;
    if (jobRow && jobMeta) {
      const cached = await getFreshAnalysis(row.id, link.jobId, row.updatedAt, jobMeta.updatedAt);
      analysis = cached.hit && cached.analysis
        ? cached.analysis
        : analyzeCandidate({ candidate: input, job: toJobRequirement(jobRow), anomalies, currentYear });
    }

    const [submission, pipeline, interviewRow] = await Promise.all([
      prisma.submission.findUnique({ where: { jobId_candidateId: { jobId: link.jobId, candidateId: row.id } } }),
      prisma.pipeline.findUnique({ where: { candidateId_jobId: { candidateId: row.id, jobId: link.jobId } } }),
      // Latest interview for this candidate+job (scheduled or completed) — client-safe.
      prisma.interview.findFirst({ where: { candidateId: row.id, jobId: link.jobId, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" } }),
    ]);

    let sharedNotes: ClientSafeCandidate["sharedNotes"] = [];
    if (slc.shareNotes) {
      // Even when notes are shared, INTERNAL notes never cross the boundary.
      // shareNotes only surfaces the client-safe (internal=false) notes.
      const notes = await prisma.note.findMany({
        where: { candidateId: row.id, internal: false, deletedAt: null, OR: [{ jobId: link.jobId }, { jobId: null }] },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      sharedNotes = notes.map((n) => ({ kind: n.kind, body: n.body, createdAt: n.createdAt }));
    }

    candidates.push({
      id: row.id,
      name: row.fullName,
      title: row.title,
      country: row.country,
      english: row.englishLevel,
      availability: row.availability,
      availabilityNote: row.availabilityNote,
      rate: row.clientRate, // ONLY the client price; internal cost is never sent
      skills: input.skills.map((s) => s.name),
      summary: row.aiSummary,
      matchScore: analysis?.matchScore ?? 0,
      recommendation: analysis?.recommendation ?? "possible",
      strengths: analysis?.strengths ?? [],
      risks: analysis?.risks ?? [], // curated risks only; anomalies stay internal
      sharedNotes,
      clientStatus: submission?.clientStatus ?? "pending",
      stage: STAGE_LABEL[(pipeline?.stage ?? "sent_to_client") as PipelineStage],
      interview: interviewRow ? projectClientInterview(interviewRow) : null,
    });
  }

  return {
    token: link.token,
    label: link.label,
    job: { id: link.job.id, title: link.job.title, seniority: link.job.seniority },
    client: link.client ? { name: link.client.name, company: link.client.company } : null,
    candidates,
  };
}

type InterviewRow = {
  recordingUrl: string | null;
  summary: string | null;
  actionItems: unknown;
  completedAt: Date | null;
  scheduledFor: Date | null;
  proposedSlots: unknown;
  meetingUrl: string | null;
  meetingProvisioned: boolean;
  webhookStatus: string;
  status: string;
};

/**
 * Project an interview into the client-safe shape, enforcing the no-fake-link
 * rule (Mission 8 Phase 1):
 * - A recording link is shown ONLY when a real meeting-intelligence provider is
 *   configured AND a recording exists; otherwise the client sees a "pending" flag.
 * - A meeting/join link is shown ONLY when it is provisioned (recruiter-provided
 *   or booked by a real provider); otherwise "pending".
 */
function projectClientInterview(iv: InterviewRow): ClientSafeCandidate["interview"] {
  const recordingsLive = meetingsConfigured();
  const screened = Boolean(iv.completedAt) || iv.status === "completed" || iv.webhookStatus === "summary_ready" || Boolean(iv.summary);
  const recordingUrl = recordingsLive && iv.recordingUrl ? iv.recordingUrl : null;
  const meetingUrl = iv.meetingProvisioned && iv.meetingUrl ? iv.meetingUrl : null;
  const upcoming = iv.status !== "cancelled" && !iv.completedAt;
  return {
    recordingUrl,
    recordingPending: screened && !recordingUrl,
    summary: iv.summary,
    actionItems: iv.actionItems,
    completedAt: iv.completedAt,
    scheduledFor: iv.scheduledFor,
    proposedSlots: Array.isArray(iv.proposedSlots) ? (iv.proposedSlots as string[]) : [],
    meetingUrl,
    meetingPending: upcoming && Boolean(iv.scheduledFor) && !meetingUrl,
    status: iv.status,
  };
}

/** A client action through the link — authorized purely by the token. */
export async function recordDecision(token: string, candidateId: string, decision: ClientDecision, feedback?: string, ip?: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { candidates: true },
  });
  if (!link) throw new ShareError("not_found");
  if (link.revoked) throw new ShareError("revoked");
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new ShareError("expired");
  if (!link.candidates.some((c) => c.candidateId === candidateId)) throw new ShareError("candidate_not_shared");

  return applyClientDecision({ candidateId, jobId: link.jobId, decision, via: "share_link", reason: feedback, ip });
}

/** Validate a token + that the candidate is on the link; returns the link's job/client. */
export async function assertSharedCandidate(token: string, candidateId: string): Promise<{ jobId: string; clientId: string | null }> {
  const link = await prisma.shareLink.findUnique({ where: { token }, include: { candidates: true } });
  if (!link) throw new ShareError("not_found");
  if (link.revoked) throw new ShareError("revoked");
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new ShareError("expired");
  if (!link.candidates.some((c) => c.candidateId === candidateId)) throw new ShareError("candidate_not_shared");
  return { jobId: link.jobId, clientId: link.clientId };
}

export async function revokeShareLink(token: string, revokedBy?: string): Promise<void> {
  await prisma.shareLink.update({
    where: { token },
    data: { revoked: true, revokedAt: new Date(), revokedBy: revokedBy ?? null },
  });
}
