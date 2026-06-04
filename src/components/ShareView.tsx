"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { MatchRing, Pill } from "@/components/primitives";

interface ClientCandidate {
  id: string;
  name: string;
  title: string | null;
  country: string | null;
  english: string | null;
  availability: string;
  availabilityNote: string | null;
  rate: number | null;
  skills: string[];
  summary: string | null;
  matchScore: number;
  recommendation: string;
  strengths: { text: string; evidence: string }[];
  risks: { text: string; severity: string }[];
  sharedNotes: { kind: string; body: string }[];
  clientStatus: string;
  stage: string;
}

interface ShareData {
  token: string;
  label: string | null;
  job: { id: string; title: string; seniority: string | null };
  client: { name: string; company: string | null } | null;
  candidates: ClientCandidate[];
  error?: string;
}

export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [status, setStatus] = useState<number>(0);
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/share/${token}`);
    setStatus(res.status);
    setData(await res.json());
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(candidateId: string, decision: string) {
    setPending(candidateId + decision);
    await fetch(`/api/share/${token}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, decision }),
    });
    setPending(null);
    load();
  }

  if (status !== 0 && status >= 400) {
    return (
      <div className="share-page">
        <div className="share-top">
          <div className="brand-mark">A</div>
          <div className="brand-name">ANVI</div>
        </div>
        <div className="share-wrap">
          <div className="banner banner-bad">
            This share link is {status === 410 ? "no longer active" : "not valid"}. Please ask your recruiter for a new one.
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.job) {
    return (
      <div className="share-page">
        <div className="share-top">
          <div className="brand-mark">A</div>
          <div className="brand-name">ANVI</div>
        </div>
        <div className="share-wrap"><div className="loading">Loading…</div></div>
      </div>
    );
  }

  return (
    <div className="share-page">
      <div className="share-top">
        <div className="brand-mark">A</div>
        <div className="brand-name">ANVI</div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--mute)" }}>
          {data.client?.company ?? "Client"} · shared candidates
        </div>
      </div>
      <div className="share-wrap">
        <div className="share-hello">{data.label ?? data.job.title}</div>
        <div className="share-sub">
          {data.candidates.length} candidate{data.candidates.length === 1 ? "" : "s"} selected for {data.job.title}. Review and let us
          know your decision — approve, request an interview, or pass.
        </div>

        {data.candidates.map((c) => (
          <div key={c.id} className="share-card">
            <div className="share-card-head">
              <MatchRing score={c.matchScore} size={48} />
              <div className="share-card-id">
                <div className="share-card-name">{c.name}</div>
                <div className="share-card-meta">
                  {[c.title, c.country, c.english && `${c.english} English`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{c.rate != null ? `$${c.rate}/hr` : "—"}</div>
                <DecisionBadge status={c.clientStatus} />
              </div>
            </div>

            {c.summary && <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-soft)", marginBottom: 12 }}>{c.summary}</div>}

            <div className="tag-row tag-row-sm" style={{ marginBottom: 12 }}>
              {c.skills.map((s) => (
                <span key={s} className="tag tag-sm">{s}</span>
              ))}
            </div>

            {c.strengths.length > 0 && (
              <div className="intel-list" style={{ marginBottom: 8 }}>
                {c.strengths.slice(0, 3).map((s, i) => (
                  <div key={i} className="intel intel-good"><span className="intel-ic">✅</span><div>{s.text}</div></div>
                ))}
              </div>
            )}
            {c.risks.length > 0 && (
              <div className="intel-list">
                {c.risks.slice(0, 3).map((r, i) => (
                  <div key={i} className="intel intel-warn"><span className="intel-ic">⚠️</span><div>{r.text}</div></div>
                ))}
              </div>
            )}

            {c.sharedNotes.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="sect-label"><Icon name="message" size={13} /> Notes from your recruiter</div>
                {c.sharedNotes.map((n, i) => (
                  <div key={i} style={{ fontSize: 13, color: "var(--ink-soft)", padding: "4px 0" }}>• {n.body}</div>
                ))}
              </div>
            )}

            <div className="share-actions">
              <button className="btn btn-good" disabled={!!pending} onClick={() => decide(c.id, "approve")}>
                <Icon name="check" size={15} /> Approve
              </button>
              <button className="btn btn-ghost" disabled={!!pending} onClick={() => decide(c.id, "request_interview")}>
                <Icon name="calendar" size={15} /> Request interview
              </button>
              <button className="btn btn-bad" disabled={!!pending} onClick={() => decide(c.id, "reject")}>
                <Icon name="x" size={15} /> Pass
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="share-foot">Powered by ANVI · This is a private link. Internal notes are not shown unless your recruiter shares them.</div>
    </div>
  );
}

function DecisionBadge({ status }: { status: string }) {
  if (status === "approved") return <Pill tone="good">Approved</Pill>;
  if (status === "rejected") return <Pill tone="bad">Passed</Pill>;
  return <Pill tone="default">Awaiting you</Pill>;
}
