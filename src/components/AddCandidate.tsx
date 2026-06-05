"use client";

import React, { useState, useRef } from "react";
import { Icon } from "@/components/Icon";
import { api, PdfImportResult } from "@/lib/client/api";

type Mode = "manual" | "cv" | "pdf" | "linkedin";
const SOURCES = ["Manual", "LinkedIn", "Telegram", "Referral", "Email"];

export function AddCandidate({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // manual fields
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [rate, setRate] = useState("");
  const [years, setYears] = useState("");
  const [english, setEnglish] = useState("");
  const [skills, setSkills] = useState("");
  const [source, setSource] = useState("Manual");
  // cv / linkedin
  const [cvText, setCvText] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  // pdf upload
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pdfResult, setPdfResult] = useState<PdfImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === "cv") {
        body = { mode: "cv", cvText, source: "CV" };
      } else if (mode === "linkedin") {
        body = { mode: "linkedin", linkedinUrl, fullName: fullName || undefined, source: "LinkedIn" };
      } else {
        body = {
          mode: "manual", fullName, country: country || undefined, source,
          clientRate: rate ? Number(rate) : undefined,
          totalYears: years ? Number(years) : undefined,
          englishLevel: english || undefined,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean).map((name) => ({ name, years: years ? Number(years) : 2 })),
        };
      }
      const res = await api.createCandidate(body);
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
      onCreated(res.id!);
    } catch {
      setError("Could not add candidate.");
      setBusy(false);
    }
  }

  async function submitPdf() {
    if (pdfFiles.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.importPdf(pdfFiles, "CV");
      setPdfResult(res);
    } catch {
      setError("Could not import the PDF files.");
    } finally {
      setBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    setPdfFiles((prev) => [...prev, ...incoming].slice(0, 50));
    setPdfResult(null);
  }

  function finishPdf() {
    const firstCreated = pdfResult?.results.find((r) => r.status === "created" && r.id);
    if (firstCreated?.id) onCreated(firstCreated.id);
    else onClose();
  }

  const canSubmit = mode === "cv" ? cvText.trim().length > 20 : mode === "linkedin" ? linkedinUrl.includes("linkedin") : fullName.trim().length > 0;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="modal">
        <button className="drawer-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="rcard-title" style={{ marginBottom: 4 }}>Add candidate</div>
        <div style={{ fontSize: 12.5, color: "var(--mute)", marginBottom: 14 }}>One person, or a stack of CVs — no spreadsheet needed.</div>

        <div className="view-filters" style={{ marginBottom: 14 }}>
          {(["manual", "cv", "pdf", "linkedin"] as Mode[]).map((m) => (
            <button key={m} className="chip" data-active={mode === m ? "" : undefined} onClick={() => { setMode(m); setError(null); }}>
              {m === "manual" ? "Manual entry" : m === "cv" ? "Paste CV" : m === "pdf" ? "Upload PDF" : "LinkedIn URL"}
            </button>
          ))}
        </div>

        {mode === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <input className="mc-in" placeholder="Full name *" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <div style={{ display: "flex", gap: 9 }}>
              <input className="mc-in" placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
              <input className="mc-in" placeholder="Rate $/hr" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))} style={{ width: 110 }} />
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <input className="mc-in" placeholder="Years exp" value={years} onChange={(e) => setYears(e.target.value.replace(/[^0-9]/g, ""))} style={{ width: 110 }} />
              <input className="mc-in" placeholder="English (e.g. C1)" value={english} onChange={(e) => setEnglish(e.target.value)} />
            </div>
            <input className="mc-in" placeholder="Skills (comma-separated)" value={skills} onChange={(e) => setSkills(e.target.value)} />
            <select className="mc-in" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}

        {mode === "cv" && (
          <div>
            <textarea className="mc-in" style={{ minHeight: 160, resize: "vertical" }} placeholder="Paste the candidate's CV text here. ANVI extracts skills, experience, seniority, country, and English level." value={cvText} onChange={(e) => setCvText(e.target.value)} />
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>AI extracts structured fields; you can edit them after.</div>
          </div>
        )}

        {mode === "pdf" && (
          <div>
            {!pdfResult ? (
              <>
                <div
                  className="pdf-drop"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                >
                  <Icon name="plus" size={20} />
                  <div style={{ fontWeight: 600, marginTop: 6 }}>Drop CV PDFs here or click to choose</div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>Upload up to 50 at once — ANVI reads each and creates a candidate.</div>
                </div>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                {pdfFiles.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                    {pdfFiles.map((f, i) => (
                      <div key={i} className="pdf-file">
                        <Icon name="briefcase" size={13} /> <span style={{ flex: 1 }}>{f.name}</span>
                        <button className="drawer-x" style={{ position: "static" }} onClick={() => setPdfFiles((p) => p.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div>
                <div className="banner banner-good">Imported {pdfResult.created} · {pdfResult.duplicates} duplicate{pdfResult.duplicates === 1 ? "" : "s"} · {pdfResult.errors} error{pdfResult.errors === 1 ? "" : "s"}</div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflow: "auto" }}>
                  {pdfResult.results.map((r, i) => (
                    <div key={i} className="pdf-file">
                      <span className={"health-dot " + (r.status === "created" ? (r.nameConfidence === "low" ? "health-yellow" : "health-green") : r.status === "duplicate" ? "health-yellow" : "health-red")} />
                      <span style={{ flex: 1, fontSize: 12.5 }}>{r.name || r.file}{r.status === "created" && r.nameConfidence === "low" ? " ⚠️" : ""}</span>
                      <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{r.status === "created" ? (r.nameConfidence === "low" ? "name from email — verify" : `${r.skills ?? 0} skills`) : r.status === "duplicate" ? "already exists" : r.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "linkedin" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <input className="mc-in" placeholder="https://linkedin.com/in/…" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
            <input className="mc-in" placeholder="Name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Stores the profile URL now; enrichment is prepared for later.</div>
          </div>
        )}

        {error && <div className="banner banner-bad" style={{ marginTop: 12 }}>{error}</div>}
        <div className="rcard-actions">
          {mode === "pdf" ? (
            pdfResult ? (
              <button className="btn btn-primary" onClick={finishPdf}><Icon name="check" size={15} /> Done</button>
            ) : (
              <button className="btn btn-primary" onClick={submitPdf} disabled={pdfFiles.length === 0 || busy}>
                <Icon name="plus" size={15} /> {busy ? "Reading…" : `Import ${pdfFiles.length || ""} PDF${pdfFiles.length === 1 ? "" : "s"}`}
              </button>
            )
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={!canSubmit || busy}>
              <Icon name="plus" size={15} /> {busy ? "Adding…" : "Add candidate"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
