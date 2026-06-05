"use client";

import React, { useState } from "react";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/client/api";

type Mode = "manual" | "cv" | "linkedin";
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

  const canSubmit = mode === "cv" ? cvText.trim().length > 20 : mode === "linkedin" ? linkedinUrl.includes("linkedin") : fullName.trim().length > 0;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="modal">
        <button className="drawer-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="rcard-title" style={{ marginBottom: 4 }}>Add candidate</div>
        <div style={{ fontSize: 12.5, color: "var(--mute)", marginBottom: 14 }}>One person at a time — no spreadsheet needed.</div>

        <div className="view-filters" style={{ marginBottom: 14 }}>
          {(["manual", "cv", "linkedin"] as Mode[]).map((m) => (
            <button key={m} className="chip" data-active={mode === m ? "" : undefined} onClick={() => setMode(m)}>
              {m === "manual" ? "Manual entry" : m === "cv" ? "Paste CV" : "LinkedIn URL"}
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

        {mode === "linkedin" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <input className="mc-in" placeholder="https://linkedin.com/in/…" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
            <input className="mc-in" placeholder="Name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Stores the profile URL now; enrichment is prepared for later.</div>
          </div>
        )}

        {error && <div className="banner banner-bad" style={{ marginTop: 12 }}>{error}</div>}
        <div className="rcard-actions">
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit || busy}>
            <Icon name="plus" size={15} /> {busy ? "Adding…" : "Add candidate"}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
