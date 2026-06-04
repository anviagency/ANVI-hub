import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";

export const runtime = "nodejs";

const Body = z.object({ name: z.string().min(1) });

// POST /api/clients/resolve — the "Who is the client?" step (spec §2.2).
// Returns an existing match (so the UI can offer "Attach to X?") or signals
// that a new client should be created.
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const q = parsed.data.name.trim();
  const all = await prisma.client.findMany();
  const lower = q.toLowerCase();

  // Match on name OR company, first-name, or initials.
  const match = all.find((c) => {
    const name = c.name.toLowerCase();
    const company = (c.company ?? "").toLowerCase();
    return (
      name === lower ||
      company === lower ||
      name.startsWith(lower) ||
      name.split(/\s+/).includes(lower) ||
      company.includes(lower)
    );
  });

  if (match) {
    return NextResponse.json({
      found: true,
      client: { id: match.id, name: match.name, company: match.company },
    });
  }
  return NextResponse.json({ found: false, suggestedName: q });
}
