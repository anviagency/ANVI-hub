import { NextRequest, NextResponse } from "next/server";
import { resolveShareLink, ShareError } from "@/lib/share";

export const runtime = "nodejs";

// GET /api/share/:token — PUBLIC client view. Authorized solely by the token.
// Returns only client-safe fields for only the shared candidates.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const data = await resolveShareLink(token);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof ShareError) return NextResponse.json({ error: e.code }, { status: shareStatus(e.code) });
    console.error("share resolve failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

function shareStatus(code: string): number {
  if (code === "not_found") return 404;
  if (code === "revoked" || code === "expired") return 410; // Gone
  return 400;
}
