import * as XLSX from "xlsx";

// Spreadsheet parsing for candidate import (mission item 1). SheetJS handles
// both .xlsx and .csv from a single buffer.

export interface ParsedSheet {
  columns: string[];
  rows: Record<string, string>[];
}

export function parseSpreadsheet(buffer: Buffer | ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return { columns: [], rows: [] };
  const sheet = wb.Sheets[firstSheet];

  // Header row -> columns.
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (matrix.length === 0) return { columns: [], rows: [] };
  const columns = (matrix[0] as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean);

  const rows: Record<string, string>[] = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
    .map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) out[String(k).trim()] = String(v ?? "").trim();
      return out;
    });

  return { columns, rows };
}

// The canonical fields ANVI imports into. The UI maps source columns onto these.
export const IMPORT_FIELDS = [
  { key: "fullName", label: "Full name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Title" },
  { key: "country", label: "Country" },
  { key: "location", label: "City / location" },
  { key: "englishLevel", label: "English level" },
  { key: "totalYears", label: "Years experience" },
  { key: "clientRate", label: "Client rate ($/hr)" },
  { key: "salaryExpectation", label: "Cost / expectation ($/hr)" },
  { key: "availability", label: "Availability" },
  { key: "skills", label: "Skills (comma-separated)" },
  { key: "linkedinUrl", label: "LinkedIn URL" },
  { key: "source", label: "Source" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

/** Best-effort auto-mapping of source columns to ANVI fields by fuzzy header match. */
export function suggestMapping(columns: string[]): Partial<Record<ImportFieldKey, string>> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Partial<Record<ImportFieldKey, string>> = {};
  const hints: Record<ImportFieldKey, string[]> = {
    fullName: ["fullname", "name", "candidate", "fullnames"],
    email: ["email", "mail", "e-mail"],
    phone: ["phone", "mobile", "tel"],
    title: ["title", "role", "position"],
    country: ["country"],
    location: ["city", "location", "town"],
    englishLevel: ["english", "englishlevel", "language"],
    totalYears: ["years", "experience", "yoe", "yearsexperience"],
    clientRate: ["clientrate", "rate", "hourlyrate", "price"],
    salaryExpectation: ["salary", "cost", "expectation", "salaryexpectation"],
    availability: ["availability", "available", "status"],
    skills: ["skills", "stack", "technologies", "tech"],
    linkedinUrl: ["linkedin", "linkedinurl", "li"],
    source: ["source", "channel", "origin"],
  };
  for (const col of columns) {
    const n = norm(col);
    for (const [field, words] of Object.entries(hints) as [ImportFieldKey, string[]][]) {
      if (map[field]) continue;
      if (words.some((w) => n === w || n.includes(w))) {
        map[field] = col;
        break;
      }
    }
  }
  return map;
}
