import { NextRequest, NextResponse } from "next/server";
import { parseSpreadsheet, suggestMapping, IMPORT_FIELDS } from "@/lib/import/parse";

export const runtime = "nodejs";

// POST /api/import/preview — multipart upload; returns detected columns, sample
// rows, and a suggested field mapping for the recruiter to confirm.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const { columns, rows } = parseSpreadsheet(buf);
  if (columns.length === 0) {
    return NextResponse.json({ error: "Could not read any columns from the file" }, { status: 422 });
  }
  return NextResponse.json({
    filename: file.name,
    columns,
    sample: rows.slice(0, 5),
    rowCount: rows.length,
    suggestedMapping: suggestMapping(columns),
    fields: IMPORT_FIELDS,
  });
}
