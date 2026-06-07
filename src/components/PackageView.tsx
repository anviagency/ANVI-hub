"use client";

import React, { useEffect, useState } from "react";

interface Item {
  candidateId: string;
  name: string;
  title: string | null;
  country: string | null;
  englishLevel: string | null;
  availability: string;
  availabilityNote: string | null;
  rate: number | null;
  skills: string[];
  summary: string | null;
  recommendation: string | null;
  matchScore: number | null;
  strengths: { text: string }[];
  risks: { text: string }[];
  experience: { company: string; title: string | null; period: string }[];
  interviewSummary: string | null;
}

interface Pkg {
  title: string | null;
  job: { title: string };
  client: { name: string; company: string | null } | null;
  branding: { agencyName?: string; logoUrl?: string; color?: string };
  items: Item[];
  error?: string;
}

// Client Package view (Mission 10 Phase 6). Branded, anonymized, print-optimized
// (Save as PDF via the browser). Token-authorized, read-only — NEVER shows phone,
// email, LinkedIn, internal cost, internal notes, or transcript.
export function PackageView({ token }: { token: string }) {
  const [data, setData] = useState<Pkg | null>(null);
  const [status, setStatus] = useState(0);

  useEffect(() => {
    fetch(`/api/package/${token}`).then(async (r) => {
      setStatus(r.status);
      setData(await r.json());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status >= 400) {
    return <div style={wrap}><div style={{ padding: 24, color: "#991b1b" }}>This package link is not valid. Please ask your recruiter for a new one.</div></div>;
  }
  if (!data || !data.job) return <div style={wrap}><div style={{ padding: 24, color: "#6b7280" }}>Loading…</div></div>;

  const color = data.branding?.color || "#4f46e5";
  const agency = data.branding?.agencyName || "ANVI";

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px" }}>
        <div className="pkg-noprint" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={() => window.print()} style={{ ...btn, background: color }}>Save as PDF</button>
        </div>

        <header style={{ borderBottom: `3px solid ${color}`, paddingBottom: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
          {data.branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.branding.logoUrl} alt={agency} style={{ height: 40 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 10, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>{agency[0]}</div>
          )}
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{data.title ?? `${data.job.title} — candidate package`}</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Prepared by {agency}{data.client ? ` for ${data.client.company ?? data.client.name}` : ""} · {data.items.length} candidate{data.items.length === 1 ? "" : "s"}</div>
          </div>
        </header>

        {data.items.map((c, i) => (
          <section key={c.candidateId} style={{ marginBottom: 26, pageBreakInside: "avoid" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{i + 1}. {c.name}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.rate != null ? `$${c.rate}/hr` : ""}</div>
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
              {[c.title, c.country, c.englishLevel && `${c.englishLevel} English`, c.availability === "available" ? "Available" : c.availability].filter(Boolean).join(" · ")}
            </div>
            {c.summary && <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: "6px 0" }}>{c.summary}</p>}

            {c.skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
                {c.skills.map((s) => <span key={s} style={chip}>{s}</span>)}
              </div>
            )}

            {c.strengths.length > 0 && (
              <div style={{ margin: "8px 0" }}>
                <div style={label}>Strengths</div>
                <ul style={ul}>{c.strengths.map((s, j) => <li key={j}>{s.text}</li>)}</ul>
              </div>
            )}
            {c.risks.length > 0 && (
              <div style={{ margin: "8px 0" }}>
                <div style={label}>Considerations</div>
                <ul style={ul}>{c.risks.map((r, j) => <li key={j}>{r.text}</li>)}</ul>
              </div>
            )}

            {c.experience.length > 0 && (
              <div style={{ margin: "8px 0" }}>
                <div style={label}>Experience</div>
                {c.experience.map((e, j) => (
                  <div key={j} style={{ fontSize: 13, marginBottom: 2 }}>{e.title ?? "—"} · {e.company} <span style={{ color: "#9ca3af" }}>({e.period})</span></div>
                ))}
              </div>
            )}

            {c.interviewSummary && (
              <div style={{ margin: "8px 0" }}>
                <div style={label}>Interview summary</div>
                <p style={{ fontSize: 13, lineHeight: 1.5 }}>{c.interviewSummary}</p>
              </div>
            )}
          </section>
        ))}

        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, fontSize: 11.5, color: "#9ca3af" }}>
          Prepared by {agency}. Candidate contact details are withheld; please coordinate through your recruiter.
        </footer>
      </div>
      <style>{`@media print { .pkg-noprint { display: none !important; } body { background: #fff; } }`}</style>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", background: "#f8fafc", color: "#111827", fontFamily: "ui-sans-serif, system-ui, sans-serif" };
const btn: React.CSSProperties = { color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13.5 };
const chip: React.CSSProperties = { fontSize: 12, background: "#eef2ff", color: "#3730a3", borderRadius: 7, padding: "3px 9px" };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginBottom: 3 };
const ul: React.CSSProperties = { margin: "2px 0 0 18px", fontSize: 13, lineHeight: 1.5 };
