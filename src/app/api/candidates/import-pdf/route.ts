import { NextRequest, NextResponse } from "next/server";
import { authorizeMutation, RECRUITER_ROLES } from "@/lib/auth/guard";
import { getClientIp } from "@/lib/security/request";
import { createCandidateFromCv } from "@/lib/import/cv-intake";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 50;
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per file

// POST /api/candidates/import-pdf — multipart upload of one or more CV PDFs.
// Each PDF is text-extracted, parsed, and turned into a candidate (deduped).
export async function POST(req: NextRequest) {
  const auth = await authorizeMutation(req, RECRUITER_ROLES);
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart_form_data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "no_files" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: "too_many_files", max: MAX_FILES }, { status: 400 });

  const source = (form.get("source") as string) || "CV";
  const { getDocumentProxy } = await import("unpdf");
  const ip = getClientIp(req);

  // Reconstruct line breaks from text-item positions — pdfjs' plain text join
  // flattens a CV to a single line, which breaks name/section detection.
  async function extractLines(bytes: Uint8Array): Promise<string> {
    const pdf = await getDocumentProxy(bytes);
    const out: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let line = "";
      for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
        line += it.str ?? "";
        if (it.hasEOL) { out.push(line); line = ""; }
        else if (it.str && !it.str.endsWith(" ")) line += " ";
      }
      if (line.trim()) out.push(line);
    }
    return out.join("\n");
  }

  const results: { file: string; status: "created" | "duplicate" | "error"; id?: string; name?: string | null; skills?: number; error?: string; nameConfidence?: "high" | "low" | "none" }[] = [];

  for (const file of files) {
    const name = file.name || "cv.pdf";
    try {
      if (!/\.pdf$/i.test(name) && file.type !== "application/pdf") {
        results.push({ file: name, status: "error", error: "not_a_pdf" });
        continue;
      }
      if (file.size > MAX_BYTES) {
        results.push({ file: name, status: "error", error: "file_too_large" });
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const cvText = (await extractLines(bytes)).trim();
      if (cvText.length < 20) {
        results.push({ file: name, status: "error", error: "no_extractable_text" });
        continue;
      }

      const r = await createCandidateFromCv(cvText, { source, userId: auth.user.id, ip, mode: "pdf" });
      if (r.error) results.push({ file: name, status: "error", error: r.error });
      else if (r.duplicate) results.push({ file: name, status: "duplicate", id: r.id, name: r.name });
      else results.push({ file: name, status: "created", id: r.id, name: r.name, skills: r.skills, nameConfidence: r.nameConfidence });
    } catch (e) {
      results.push({ file: name, status: "error", error: e instanceof Error ? e.message.slice(0, 120) : "parse_failed" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const duplicates = results.filter((r) => r.status === "duplicate").length;
  const errors = results.filter((r) => r.status === "error").length;
  return NextResponse.json({ created, duplicates, errors, total: results.length, results });
}
