import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";
import { respondToOffer, OfferError, isOfferStatus } from "@/lib/offers";

export const runtime = "nodejs";

function offerErrorStatus(code: OfferError["code"]): number {
  switch (code) {
    case "offer_not_found":
      return 404;
    case "invalid_transition":
      return 422;
    default:
      return 400;
  }
}

// GET /api/offers/:id — a single offer with its placement (auth required).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      candidate: { select: { id: true, fullName: true, title: true, country: true } },
      job: { select: { id: true, title: true } },
      client: { select: { id: true, name: true, company: true } },
      placement: { select: { id: true, status: true, startDate: true, onboardingStatus: true } },
    },
  });
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    offer: {
      id: offer.id,
      status: offer.status,
      clientRate: offer.clientRate,
      salary: offer.salary,
      currency: offer.currency,
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
      notes: offer.notes,
      declineReason: offer.declineReason,
      sentAt: offer.sentAt,
      respondedAt: offer.respondedAt,
      createdAt: offer.createdAt,
      candidate: { id: offer.candidate.id, name: offer.candidate.fullName, title: offer.candidate.title, country: offer.candidate.country },
      job: offer.job,
      client: offer.client,
      placement: offer.placement,
    },
  });
}

const UpdateOffer = z.object({
  status: z.string().refine(isOfferStatus, { message: "Unknown offer status" }),
  startDate: z.string().datetime().optional(),
  declineReason: z.string().max(2000).optional(),
});

// PATCH /api/offers/:id — accept / decline / withdraw / (re)send an offer (auth required).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = UpdateOffer.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const { offer, placementId } = await respondToOffer({
      offerId: id,
      to: d.status,
      startDate: d.startDate ? new Date(d.startDate) : undefined,
      declineReason: d.declineReason,
      actor: "recruiter",
    });
    await audit({ userId: auth.user.id, action: `offer_${d.status}`, entity: "offer", entityId: offer.id, meta: { placementId }, ip: getClientIp(req) });
    return NextResponse.json({ offer: { id: offer.id, status: offer.status, startDate: offer.startDate }, placementId });
  } catch (e) {
    if (e instanceof OfferError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: offerErrorStatus(e.code) });
    }
    console.error("offer update failed", e);
    return NextResponse.json({ error: "Offer update failed" }, { status: 500 });
  }
}
