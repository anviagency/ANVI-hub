import { prisma } from "@/lib/db";
import { applyStage, PipelineTransitionError } from "@/lib/pipeline";
import { notifyBoth } from "@/lib/notify";
import type { Actor, Offer, OfferStatus, PipelineStage } from "@prisma/client";

// Offer lifecycle — the stage that closes the funnel (spec §8):
//   approval/interview → offer extended → accepted → hired → placement.
//
// I/O lives here but the pure transition guard (`canOfferTransition`) is exported
// separately so the state machine is unit-testable without a database (spec §4.3).

export const OFFER_STATUSES: OfferStatus[] = ["draft", "sent", "accepted", "declined", "withdrawn"];

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

// Legal status transitions. `accepted` is terminal (a hire has been recorded).
// A `declined` or `withdrawn` offer can be re-sent (the recruiter re-negotiates).
const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ["sent", "withdrawn"],
  sent: ["accepted", "declined", "withdrawn"],
  accepted: [],
  declined: ["sent", "withdrawn"],
  withdrawn: ["sent"],
};

export function canOfferTransition(from: OfferStatus, to: OfferStatus): boolean {
  if (from === to) return true; // idempotent
  return OFFER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isOfferStatus(value: string): value is OfferStatus {
  return (OFFER_STATUSES as string[]).includes(value);
}

export type OfferErrorCode =
  | "candidate_not_found"
  | "job_not_found"
  | "job_no_client"
  | "offer_not_found"
  | "invalid_transition"
  | "open_offer_exists";

export class OfferError extends Error {
  constructor(public code: OfferErrorCode, message: string) {
    super(message);
    this.name = "OfferError";
  }
}

export interface CreateOfferInput {
  candidateId: string;
  jobId: string;
  clientRate?: number | null;
  salary?: number | null;
  currency?: string | null;
  startDate?: Date | null;
  expiresAt?: Date | null;
  notes?: string | null;
  createdBy?: string | null;
  actor?: Actor;
}

/**
 * Extend an offer to a candidate for a job. Snapshots the client rate / internal
 * salary at offer time, moves the pipeline to the `offer` stage, records a
 * timeline event, and notifies recruiters. There can be at most one open
 * (draft/sent) offer per candidate-per-job at a time.
 */
export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  const { candidateId, jobId } = input;
  const actor: Actor = input.actor ?? "recruiter";

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new OfferError("job_not_found", `Job ${jobId} not found`);
  if (!job.clientId) throw new OfferError("job_no_client", "Cannot extend an offer for a job that has no client attached");

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new OfferError("candidate_not_found", `Candidate ${candidateId} not found`);

  const openOffer = await prisma.offer.findFirst({
    where: { candidateId, jobId, status: { in: ["draft", "sent"] } },
  });
  if (openOffer) {
    throw new OfferError("open_offer_exists", "An open offer already exists for this candidate on this role");
  }

  // An offer is only meaningful once a candidate has reached the client. Require
  // an existing pipeline row in a post-screening stage so we never offer to a
  // brand-new, unscreened candidate (applyStage's first-touch would otherwise
  // silently jump straight to `offer`).
  const OFFERABLE_FROM: PipelineStage[] = ["sent_to_client", "interview", "approved", "offer"];
  const pipeline = await prisma.pipeline.findUnique({
    where: { candidateId_jobId: { candidateId, jobId } },
  });
  if (!pipeline || !OFFERABLE_FROM.includes(pipeline.stage)) {
    throw new OfferError(
      "invalid_transition",
      "Advance the candidate to at least 'sent to client', 'interview' or 'approved' before extending an offer"
    );
  }

  // Advance the pipeline to `offer` (idempotent when already at `offer`).
  try {
    await applyStage({ candidateId, jobId, to: "offer", actor });
  } catch (e) {
    if (e instanceof PipelineTransitionError) {
      throw new OfferError("invalid_transition", e.message);
    }
    throw e;
  }

  const offer = await prisma.offer.create({
    data: {
      candidateId,
      jobId,
      clientId: job.clientId,
      status: "sent",
      clientRate: input.clientRate ?? candidate.clientRate ?? null,
      salary: input.salary ?? candidate.salaryExpectation ?? null,
      currency: input.currency ?? "usd",
      startDate: input.startDate ?? null,
      expiresAt: input.expiresAt ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
      sentAt: new Date(),
    },
  });

  await prisma.candidateEvent.create({
    data: {
      candidateId,
      jobId,
      clientId: job.clientId,
      type: "offer_extended",
      actor,
      meta: { offerId: offer.id, clientRate: offer.clientRate, startDate: offer.startDate },
    },
  });

  await notifyBoth({
    title: `Offer extended: ${candidate.fullName}`,
    body: `An offer was extended to ${candidate.fullName} for ${job.title}${
      offer.clientRate ? ` at $${offer.clientRate}/hr` : ""
    }.`,
    jobId,
    candidateId,
  });

  return offer;
}

export interface RespondToOfferInput {
  offerId: string;
  to: OfferStatus;
  startDate?: Date | null;
  declineReason?: string | null;
  actor?: Actor;
}

export interface RespondToOfferResult {
  offer: Offer;
  placementId: string | null;
}

/**
 * Transition an existing offer (accept / decline / withdraw / send a draft).
 * Accepting an offer hires the candidate and creates the placement (idempotently)
 * from the offer's terms. Decline records the reason. Every transition writes a
 * timeline event and a recruiter notification.
 */
export async function respondToOffer(input: RespondToOfferInput): Promise<RespondToOfferResult> {
  const actor: Actor = input.actor ?? "recruiter";
  const offer = await prisma.offer.findUnique({ where: { id: input.offerId } });
  if (!offer) throw new OfferError("offer_not_found", `Offer ${input.offerId} not found`);

  if (!canOfferTransition(offer.status, input.to)) {
    throw new OfferError(
      "invalid_transition",
      `Invalid offer transition: ${offer.status} -> ${input.to}`
    );
  }

  const now = new Date();
  const isResponse = input.to === "accepted" || input.to === "declined";

  const updated = await prisma.offer.update({
    where: { id: offer.id },
    data: {
      status: input.to,
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.to === "declined" ? { declineReason: input.declineReason ?? null } : {}),
      ...(input.to === "sent" ? { sentAt: now } : {}),
      ...(isResponse ? { respondedAt: now } : {}),
    },
  });

  let placementId: string | null = null;

  if (input.to === "accepted") {
    // Hire the candidate; the pipeline applier creates the placement from this
    // accepted offer (offer-aware, idempotent).
    await applyStage({ candidateId: offer.candidateId, jobId: offer.jobId, to: "hired", actor });
    const placement = await prisma.placement.findFirst({
      where: { candidateId: offer.candidateId, jobId: offer.jobId },
      orderBy: { createdAt: "desc" },
    });
    placementId = placement?.id ?? null;
  } else if (input.to === "declined") {
    await applyStage({
      candidateId: offer.candidateId,
      jobId: offer.jobId,
      to: "rejected",
      actor,
      feedback: input.declineReason ?? null,
    }).catch(() => undefined);
  }

  const eventType =
    input.to === "accepted"
      ? "offer_accepted"
      : input.to === "declined"
        ? "offer_declined"
        : input.to === "withdrawn"
          ? "offer_withdrawn"
          : "offer_extended";

  await prisma.candidateEvent.create({
    data: {
      candidateId: offer.candidateId,
      jobId: offer.jobId,
      clientId: offer.clientId,
      type: eventType,
      actor,
      meta: { offerId: offer.id, status: input.to, declineReason: input.declineReason ?? null, placementId },
    },
  });

  const candidate = await prisma.candidate.findUnique({ where: { id: offer.candidateId } });
  const job = await prisma.job.findUnique({ where: { id: offer.jobId } });
  await notifyBoth({
    title: `Offer ${OFFER_STATUS_LABEL[input.to].toLowerCase()}: ${candidate?.fullName ?? "Candidate"}`,
    body: `${candidate?.fullName ?? "Candidate"}'s offer for ${job?.title ?? "a role"} is now ${OFFER_STATUS_LABEL[input.to].toLowerCase()}${
      input.to === "accepted" ? " — placement created." : "."
    }`,
    jobId: offer.jobId,
    candidateId: offer.candidateId,
  });

  return { offer: updated, placementId };
}
