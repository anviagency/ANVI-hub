import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import { createOffer, OfferError, isOfferStatus } from "@/lib/offers";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

// Map an OfferError code to an HTTP status (input/validation = 4xx).
function offerErrorStatus(code: OfferError["code"]): number {
  switch (code) {
    case "candidate_not_found":
    case "job_not_found":
      return 404;
    case "open_offer_exists":
      return 409;
    case "invalid_transition":
    case "job_no_client":
      return 422;
    default:
      return 400;
  }
}

function serializeOffer(o: {
  id: string;
  status: string;
  clientRate: number | null;
  salary: number | null;
  currency: string;
  startDate: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  declineReason: string | null;
  sentAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
  candidate?: { id: string; fullName: string; title: string | null; country: string | null } | null;
  job?: { id: string; title: string } | null;
  client?: { id: string; name: string; company: string | null } | null;
}) {
  return {
    id: o.id,
    status: o.status,
    clientRate: o.clientRate,
    salary: o.salary,
    currency: o.currency,
    startDate: o.startDate,
    expiresAt: o.expiresAt,
    notes: o.notes,
    declineReason: o.declineReason,
    sentAt: o.sentAt,
    respondedAt: o.respondedAt,
    createdAt: o.createdAt,
    candidate: o.candidate ? { id: o.candidate.id, name: o.candidate.fullName, title: o.candidate.title, country: o.candidate.country } : null,
    job: o.job ? { id: o.job.id, title: o.job.title } : null,
    client: o.client ? { id: o.client.id, name: o.client.name, company: o.client.company } : null,
  };
}

// GET /api/offers?jobId=&candidateId=&status= — list offers (auth required).
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const where: Prisma.OfferWhereInput = {};
  const jobId = sp.get("jobId");
  const candidateId = sp.get("candidateId");
  const status = sp.get("status");
  if (jobId) where.jobId = jobId;
  if (candidateId) where.candidateId = candidateId;
  if (status && isOfferStatus(status)) where.status = status;

  const offers = await prisma.offer.findMany({
    where,
    include: {
      candidate: { select: { id: true, fullName: true, title: true, country: true } },
      job: { select: { id: true, title: true } },
      client: { select: { id: true, name: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ offers: offers.map(serializeOffer) });
}

const CreateOffer = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
  clientRate: z.number().positive().optional(),
  salary: z.number().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  startDate: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

// POST /api/offers — extend an offer to a candidate for a job (auth required).
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const parsed = CreateOffer.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid offer", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const offer = await createOffer({
      candidateId: d.candidateId,
      jobId: d.jobId,
      clientRate: d.clientRate,
      salary: d.salary,
      currency: d.currency,
      startDate: d.startDate ? new Date(d.startDate) : null,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      notes: d.notes,
      createdBy: auth.user.id,
      actor: "recruiter",
    });
    await audit({ userId: auth.user.id, action: "offer_created", entity: "offer", entityId: offer.id, meta: { jobId: d.jobId, candidateId: d.candidateId, clientRate: offer.clientRate }, ip: getClientIp(req) });
    return NextResponse.json({ offer: { id: offer.id, status: offer.status, clientRate: offer.clientRate, startDate: offer.startDate } }, { status: 201 });
  } catch (e) {
    if (e instanceof OfferError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: offerErrorStatus(e.code) });
    }
    console.error("offer create failed", e);
    return NextResponse.json({ error: "Offer creation failed" }, { status: 500 });
  }
}
