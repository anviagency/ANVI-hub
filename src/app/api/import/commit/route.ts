import { NextRequest, NextResponse } from "next/server";
import { parseSpreadsheet } from "@/lib/import/parse";
import { ingestRows, ColumnMapping } from "@/lib/import/ingest";

export const runtime = "nodejs";

// POST /api/import/commit — multipart: file + mapping(JSON) [+ source]. Re-parses
// the file with the confirmed mapping and ingests (dedupe → create/update).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const mappingRaw = form?.get("mapping");
  const source = (form?.get("source") as string) || undefined;

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(typeof mappingRaw === "string" ? mappingRaw : "{}");
  } catch {
    return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 });
  }
  if (!mapping.fullName) {
    return NextResponse.json({ error: "Mapping must include a Full name column" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const { rows } = parseSpreadsheet(buf);
  const summary = await ingestRows(rows, mapping, { filename: file.name, source });
  return NextResponse.json({ summary });
}
