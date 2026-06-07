import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";
import { analyzeWriting } from "@/lib/ai/cv-quality";
import { aiEnabled } from "@/lib/ai/anthropic";

export const runtime = "nodejs";

// GET /api/candidates/:id/writing — lazy, AI-backed spelling/grammar analysis of
// the candidate's CV text. Kept off the hot profile load so the profile stays
// fast; the UI fetches this after render. Recruiter-only (internal signal).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const row = await prisma.candidate.findUnique({ where: { id }, select: { cvText: true, deletedAt: true } });
  if (!row || row.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!aiEnabled) return NextResponse.json({ available: false, reason: "ai_disabled", writing: null });
  if (!row.cvText || row.cvText.trim().length < 40) {
    return NextResponse.json({ available: false, reason: "no_cv_text", writing: null });
  }

  try {
    const writing = await analyzeWriting(row.cvText);
    if (!writing) return NextResponse.json({ available: false, reason: "analysis_unavailable", writing: null });
    return NextResponse.json({ available: true, writing });
  } catch (e) {
    console.error("writing analysis failed", e);
    return NextResponse.json({ available: false, reason: "error", writing: null });
  }
}
