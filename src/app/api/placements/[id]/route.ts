import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticate, authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// GET /api/placements/:id — a single placement (auth required).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const p = await prisma.placement.findUnique({
    where: { id },
    include: {
      candidate: { select: { id: true, fullName: true, title: true, country: true } },
      client: { select: { id: true, name: true, company: true } },
      job: { select: { id: true, title: true } },
      offer: { select: { id: true, status: true, currency: true, clientRate: true } },
    },
  });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    placement: {
      id: p.id,
      status: p.status,
      onboardingStatus: p.onboardingStatus,
      title: p.title,
      clientRate: p.clientRate,
      startDate: p.startDate,
      endDate: p.endDate,
      notes: p.notes,
      candidate: { id: p.candidate.id, name: p.candidate.fullName, title: p.candidate.title, country: p.candidate.country },
      client: p.client,
      job: p.job,
      offer: p.offer,
    },
  });
}

const UpdatePlacement = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().nullable().optional(),
    status: z.enum(["active", "ended", "paused"]).optional(),
    onboardingStatus: z.enum(["pending", "in_progress", "complete"]).optional(),
    title: z.string().max(200).optional(),
    clientRate: z.number().positive().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

// PATCH /api/placements/:id — manage a placed worker: start date, onboarding
// progress, end/pause, rate, notes (auth required).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const existing = await prisma.placement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = UpdatePlacement.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.startDate !== undefined) data.startDate = new Date(d.startDate);
  if (d.endDate !== undefined) data.endDate = d.endDate ? new Date(d.endDate) : null;
  if (d.status !== undefined) data.status = d.status;
  if (d.onboardingStatus !== undefined) data.onboardingStatus = d.onboardingStatus;
  if (d.title !== undefined) data.title = d.title;
  if (d.clientRate !== undefined) data.clientRate = d.clientRate;
  if (d.notes !== undefined) data.notes = d.notes;

  const updated = await prisma.placement.update({ where: { id }, data });
  await audit({ userId: auth.user.id, action: "placement_updated", entity: "placement", entityId: id, meta: { ...d }, ip: getClientIp(req) });

  return NextResponse.json({
    placement: { id: updated.id, status: updated.status, onboardingStatus: updated.onboardingStatus, startDate: updated.startDate, endDate: updated.endDate, clientRate: updated.clientRate },
  });
}
