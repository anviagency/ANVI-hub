"use client";

import React, { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { api, ImportPreview, ImportSummary } from "@/lib/client/api";

type Step = "upload" | "map" | "done";

export function ImportView() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);
    setBusy(true);
    try {
      const p = await api.importPreview(f);
      if (p.error) {
        setError(p.error);
        setBusy(false);
        return;
      }
      setPreview(p);
      setMapping(p.suggestedMapping ?? {});
      setStep("map");
    } catch {
      setError("Could not read the file.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.importCommit(file, mapping, "Excel import");
      if (res.error) {
        setError(res.error);
        return;
      }
      setSummary(res.summary);
      setStep("done");
    } catch {
      setError("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setMapping({});
    setSummary(null);
    setError(null);
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">Import candidates</div>
          <div className="view-sub">Upload an Excel or CSV file · map columns · ANVI deduplicates and updates existing profiles.</div>
        </div>
        {step !== "upload" && (
          <button className="btn btn-ghost" onClick={reset}>
            Start over
          </button>
        )}
      </div>

      {error && <div className="banner banner-bad" style={{ marginBottom: 16 }}>{error}</div>}

      {step === "upload" && (
        <div
          className="dropzone"
          data-drag={drag ? "" : undefined}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          <div className="dz-ic">
            <Icon name="download" size={22} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{busy ? "Reading…" : "Drop a .xlsx / .csv here, or click to choose"}</div>
          <div style={{ color: "var(--mute)", fontSize: 13, marginTop: 6 }}>
            First row must be column headers. We&apos;ll auto-suggest the mapping.
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {step === "map" && preview && (
        <div className="rcard">
          <div className="rcard-eyebrow">{preview.filename} · {preview.rowCount} rows</div>
          <div className="rcard-title" style={{ marginBottom: 6 }}>Map your columns</div>
          <div className="map-grid">
            {(preview.fields ?? []).map((f) => (
              <div key={f.key} className="map-row">
                <label>
                  {f.label}
                  {f.required && <span className="req">*</span>}
                </label>
                <select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">— ignore —</option>
                  {(preview.columns ?? []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="rcard-eyebrow" style={{ marginTop: 8 }}>Preview (first {preview.sample?.length ?? 0} rows)</div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {(preview.columns ?? []).map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(preview.sample ?? []).map((row, i) => (
                  <tr key={i}>
                    {(preview.columns ?? []).map((c) => (
                      <td key={c}>{row[c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rcard-actions">
            <button className="btn btn-primary" onClick={commit} disabled={busy || !mapping.fullName}>
              <Icon name="check" size={15} /> {busy ? "Importing…" : `Import ${preview.rowCount} rows`}
            </button>
            {!mapping.fullName && <span style={{ fontSize: 12.5, color: "var(--bad)", alignSelf: "center" }}>Map “Full name” to continue.</span>}
          </div>
        </div>
      )}

      {step === "done" && summary && (
        <div className="rcard">
          <div className="rcard-title">Import complete</div>
          <div className="summary-stats">
            <div className="summary-stat">
              <b style={{ color: "var(--good)" }}>{summary.created}</b>
              <span>Created</span>
            </div>
            <div className="summary-stat">
              <b style={{ color: "var(--accent-ink)" }}>{summary.updated}</b>
              <span>Updated</span>
            </div>
            <div className="summary-stat">
              <b style={{ color: "var(--mute)" }}>{summary.skipped}</b>
              <span>Skipped</span>
            </div>
            <div className="summary-stat">
              <b>{summary.total}</b>
              <span>Total rows</span>
            </div>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Action</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.fullName}</td>
                    <td>{r.action}</td>
                    <td>{r.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rcard-actions">
            <button className="btn btn-ghost" onClick={reset}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
