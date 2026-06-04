import { NextRequest, NextResponse } from "next/server";
import { parseSpreadsheet } from "@/lib/import/parse";
import { ColumnMapping } from "@/lib/import/ingest";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { enqueue } from "@/lib/queue/queue";
import { audit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";

// POST /api/import/commit — auth-required. Parses the upload, then ENQUEUES the
// ingest as a background job (Mission 3.5 P4) so large files never block/timeout.
// Returns a job id the client polls via /api/import/status/:jobId.
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const mappingRaw = form?.get("mapping");
  const source = (form?.get("source") as string) || undefined;

  if (!file || typeof file === "string") return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(typeof mappingRaw === "string" ? mappingRaw : "{}");
  } catch {
    return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 });
  }
  if (!mapping.fullName) return NextResponse.json({ error: "Mapping must include a Full name column" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const { rows } = parseSpreadsheet(buf);

  const taskId = await enqueue("import_candidates", { rows, mapping, filename: file.name, source });
  await audit({ userId: auth.user.id, action: "import_enqueued", entity: "import", entityId: taskId, meta: { rows: rows.length, filename: file.name }, ip: getClientIp(req) });

  return NextResponse.json({ taskId, rows: rows.length, status: "queued" }, { status: 202 });
}
