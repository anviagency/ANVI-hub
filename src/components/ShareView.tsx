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
  interview: {
    recordingUrl: string | null;
    recordingPending: boolean;
    summary: string | null;
    actionItems: unknown;
    completedAt: string | null;
    scheduledFor: string | null;
    proposedSlots: string[];
    meetingUrl: string | null;
    meetingPending: boolean;
    status: string;
  } | null;
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

  async function pickTime(candidateId: string, value: string) {
    if (!value) return;
    setPending(candidateId + "schedule");
    await fetch(`/api/share/${token}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, scheduledFor: new Date(value).toISOString() }),
    });
    setPending(null);
    load();
  }

  async function sendMessage(candidateId: string, body: string, kind: "question" | "reschedule_request") {
    if (!body.trim()) return;
    setPending(candidateId + "message");
    await fetch(`/api/share/${token}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, body, kind }),
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

            {c.interview && (c.interview.recordingUrl || c.interview.recordingPending || c.interview.summary) && (
              <div style={{ marginTop: 10, padding: 12, background: "var(--good-bg)", borderRadius: 12 }}>
                <div className="sect-label" style={{ color: "var(--good)" }}><Icon name="video" size={13} /> Screening completed</div>
                {c.interview.summary && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>{c.interview.summary}</div>}
                {Array.isArray(c.interview.actionItems) && (c.interview.actionItems as string[]).length > 0 && (
                  <ul style={{ margin: "0 0 8px 16px", fontSize: 12.5, color: "var(--ink-soft)" }}>
                    {(c.interview.actionItems as string[]).slice(0, 4).map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
                {c.interview.recordingUrl ? (
                  <a href={c.interview.recordingUrl} className="btn btn-good" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                    <Icon name="video" size={14} /> Watch recording
                  </a>
                ) : c.interview.recordingPending ? (
                  <div style={{ fontSize: 12.5, color: "var(--mute)", fontStyle: "italic" }}>Recording not ready yet — we&apos;ll notify you when it&apos;s available.</div>
                ) : null}
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

            {c.interview && c.interview.scheduledFor && c.interview.status !== "cancelled" && !c.interview.completedAt && (
              <div className="banner banner-info" style={{ marginTop: 10 }}>
                <Icon name="calendar" size={13} /> Interview set for {new Date(c.interview.scheduledFor).toLocaleString()}
                {c.interview.meetingUrl ? (
                  <> · <a href={c.interview.meetingUrl} target="_blank" rel="noreferrer">join link</a></>
                ) : c.interview.meetingPending ? (
                  <> · joining details will be shared before the call</>
                ) : null}
              </div>
            )}

            {/* Recruiter-proposed slots: the client picks one (Phase 2) */}
            {c.interview && Array.isArray(c.interview.proposedSlots) && c.interview.proposedSlots.length > 0 && !c.interview.completedAt && c.interview.status !== "cancelled" && (
              <div style={{ marginTop: 10 }}>
                <div className="sect-label"><Icon name="calendar" size={13} /> Proposed interview times — pick one</div>
                <div className="tag-row tag-row-sm">
                  {c.interview.proposedSlots.map((s) => (
                    <button key={s} className="chip" disabled={!!pending} onClick={() => pickTime(c.id, s)}>
                      {new Date(s).toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="share-actions">
              <button className="btn btn-good" disabled={!!pending} onClick={() => decide(c.id, "approve")}>
                <Icon name="check" size={15} /> Approve
              </button>
              <button className="btn btn-bad" disabled={!!pending} onClick={() => decide(c.id, "reject")}>
                <Icon name="x" size={15} /> Pass
              </button>
              <button className="btn btn-ghost" disabled={!!pending} onClick={() => decide(c.id, "request_interview")}>
                <Icon name="calendar" size={15} /> Request interview
              </button>
            </div>

            {/* Phase 4: minimal free-text so the client never dead-ends */}
            <ClientMessageBox candidateId={c.id} pending={!!pending} onSend={sendMessage} />
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

function ClientMessageBox({
  candidateId,
  pending,
  onSend,
}: {
  candidateId: string;
  pending: boolean;
  onSend: (candidateId: string, body: string, kind: "question" | "reschedule_request") => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--good)" }}>✓ Sent to your recruiter — they&apos;ll be in touch.</div>;
  }

  if (!open) {
    return (
      <button className="qa" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
        <Icon name="message" size={14} /> Ask a question or request another time
      </button>
    );
  }

  const submit = (kind: "question" | "reschedule_request") => {
    if (!text.trim()) return;
    onSend(candidateId, text.trim(), kind);
    setSent(true);
  };

  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
      <textarea
        className="mc-in"
        style={{ minHeight: 64, resize: "vertical" }}
        placeholder="Ask a question, or tell us a time that works better…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={pending || !text.trim()} onClick={() => submit("question")}>
          <Icon name="message" size={14} /> Send question
        </button>
        <button className="btn btn-ghost" disabled={pending || !text.trim()} onClick={() => submit("reschedule_request")}>
          <Icon name="calendar" size={14} /> Request another time
        </button>
      </div>
    </div>
  );
}
