import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate, RECRUITER_ROLES } from "@/lib/auth/guard";

export const runtime = "nodejs";

// GET /api/import/status/:taskId — poll a background import job.
export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await authenticate(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;
  const { taskId } = await params;
  const job = await prisma.backgroundJob.findUnique({ where: { id: taskId } });
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    taskId: job.id,
    status: job.status,
    attempts: job.attempts,
    error: job.lastError,
    summary: job.status === "done" ? job.result : null,
  });
}
