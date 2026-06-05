"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Icon } from "@/components/Icon";
import { MatchRing, Pill, Avatar, initialsOf } from "@/components/primitives";
import { api, JobWorkspace as WS, JobSuggestion, ChatResponse } from "@/lib/client/api";

const STAGES = ["new", "screened", "sent_to_client", "interview", "approved", "offer", "hired"] as const;
const STAGE_LABEL: Record<string, string> = { new: "New", screened: "Screening", sent_to_client: "Submitted", interview: "Interview", approved: "Approved", offer: "Offer", rejected: "Rejected", hired: "Placed" };

const OFFER_TONE: Record<string, "good" | "warn" | "bad" | "default" | "accent"> = { draft: "default", sent: "accent", accepted: "good", declined: "bad", withdrawn: "default" };

export function JobWorkspace({ jobId, onBack, onOpenCandidate }: { jobId: string; onBack: () => void; onOpenCandidate: (id: string, jobId?: string) => void }) {
  const [ws, setWs] = useState<WS | null>(null);
  const [sugg, setSugg] = useState<JobSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.workspace(jobId).then(setWs).catch(() => setError("Could not load the workspace."));
    api.suggestions(jobId).then((d) => setSugg(d.suggestions)).catch(() => {});
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="view"><div className="banner banner-bad">{error}</div></div>;
  if (!ws) return <div className="view"><div className="loading">Loading workspace…</div></div>;
  const o = ws.overview;
  const budget = o.budgetMin != null ? (o.budgetMin === o.budgetMax ? `$${o.budgetMin}/hr` : `$${o.budgetMin}–${o.budgetMax}/hr`) : "—";

  return (
    <div className="view" style={{ maxWidth: 1140 }}>
      <button className="profile-back" onClick={onBack}><Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back</button>

      <div className="view-head">
        <div>
          <div className="view-title">{o.title}</div>
          <div className="view-sub">{[o.client?.company, o.seniority, budget, o.workMode, o.employmentType?.replace("_", "-")].filter(Boolean).join(" · ")}</div>
        </div>
        <Pill tone={o.status === "open" ? "good" : "default"}>{o.status}</Pill>
      </div>

      {/* Proactive AI suggestions */}
      {sugg.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title"><Icon name="spark" size={14} /> ANVI suggests</div>
          {sugg.map((s, i) => (
            <div key={i} className="sugg-row">
              <span className={"health-dot " + (s.severity === "action" ? "health-green" : s.severity === "warn" ? "health-yellow" : "health-red")} style={s.severity === "info" ? { background: "var(--faint)" } : {}} />
              <span style={{ fontSize: 13.5 }}>{s.text}</span>
              {s.action && <span className="pill pill-default" style={{ marginLeft: "auto" }}>{s.action.replace("_", " ")}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Counts */}
      <div className="ws-counts">
        {([["matching", "Matching"], ["submitted", "Submitted"], ["interviewed", "Interviewed"], ["approved", "Approved"], ["hired", "Placed"]] as const).map(([k, label]) => (
          <div key={k} className="ws-count"><b>{(ws.counts as Record<string, number>)[k]}</b><span>{label}</span></div>
        ))}
      </div>

      {/* Visual pipeline */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title"><Icon name="grid" size={14} /> Pipeline</div>
        <div className="ws-pipeline">
          {STAGES.map((st, i) => (
            <React.Fragment key={st}>
              <div className="ws-stage">
                <div className="ws-stage-n">{ws.pipeline[st] ?? 0}</div>
                <div className="ws-stage-l">{STAGE_LABEL[st]}</div>
              </div>
              {i < STAGES.length - 1 && <Icon name="chevronR" size={14} className="ws-arrow" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="ws-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Top candidates */}
          <div className="panel">
            <div className="panel-title"><Icon name="users" size={14} /> Top candidates</div>
            {ws.topCandidates.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--mute)" }}>No candidates yet — ask ANVI to “match”.</div>
            ) : ws.topCandidates.map((c) => (
              <button key={c.id} className="cres" onClick={() => onOpenCandidate(c.id, jobId)}>
                <MatchRing score={c.matchScore} size={42} />
                <Avatar initials={initialsOf(c.name)} flag={c.flag} size={36} />
                <div className="cres-main">
                  <div className="cres-name">{c.name}{c.anomalies.length > 0 && <span className="cres-tag cres-tag-bad">🔴 {c.anomalies.length}</span>}</div>
                  <div className="cres-sub">{[c.country, `avail ${c.availabilityScore}%`, ...c.strengths.slice(0, 1)].filter(Boolean).join(" · ")}</div>
                  <div className="tag-row tag-row-sm">{c.skills.slice(0, 4).map((s) => <span key={s} className="tag tag-sm">{s}</span>)}</div>
                </div>
                <div className="cres-right">
                  <div className="cres-rate">{c.clientRate != null ? <>${c.clientRate}<span>/hr</span></> : "—"}</div>
                  <div className="cres-avail">{c.recommendation}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Interview history */}
          <div className="panel">
            <div className="panel-title"><Icon name="video" size={14} /> Interview history</div>
            {ws.interviews.length === 0 ? <div style={{ fontSize: 13, color: "var(--mute)" }}>No interviews yet.</div> :
              ws.interviews.map((iv) => (
                <div key={iv.id} className="note-item">
                  <div className="note-meta">{iv.candidate} · <span className="note-kind">{iv.status}</span> {iv.completedAt ? fmt(iv.completedAt) : iv.scheduledFor ? fmt(iv.scheduledFor) : ""}</div>
                  {iv.summary && <div style={{ fontSize: 13 }}>{iv.summary}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {iv.meetingUrl && iv.status !== "cancelled" && !iv.completedAt && <a className="suggest-mini" href={iv.meetingUrl} target="_blank" rel="noreferrer">Join</a>}
                    {iv.recordingUrl && <a className="suggest-mini" href={iv.recordingUrl} target="_blank" rel="noreferrer">Recording</a>}
                  </div>
                </div>
              ))}
          </div>

          {/* Offers (close the funnel, spec §8) */}
          <OffersPanel ws={ws} onChanged={load} />

          {/* Notes */}
          <div className="panel">
            <div className="panel-title"><Icon name="message" size={14} /> Recruiter notes</div>
            {ws.notes.length === 0 ? <div style={{ fontSize: 13, color: "var(--mute)" }}>No notes yet.</div> :
              ws.notes.map((n) => (
                <div key={n.id} className="note-item">
                  <div className="note-meta"><span className="note-kind">{n.kind}</span><span className={n.internal ? "note-int" : "note-pub"}>{n.internal ? "internal" : "client-safe"}</span> {n.candidate} · {fmt(n.createdAt)}</div>
                  <div style={{ fontSize: 13.5 }}>{n.body}</div>
                </div>
              ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* AI panel scoped to this job */}
          <JobAIPanel jobId={jobId} onOpenCandidate={onOpenCandidate} onChanged={load} />

          {/* Overview */}
          <div className="panel">
            <div className="panel-title"><Icon name="briefcase" size={14} /> Overview</div>
            <div className="kvline"><span>Client</span><b>{o.client?.company ?? "—"}</b></div>
            <div className="kvline"><span>Budget</span><b>{budget}</b></div>
            <div className="kvline"><span>Work mode</span><b>{o.workMode ?? "—"}</b></div>
            <div className="kvline"><span>Type</span><b>{o.employmentType?.replace("_", "-") ?? "—"}</b></div>
            <div className="kvline"><span>English</span><b>{o.englishLevel ?? "—"}</b></div>
            <div className="kvline"><span>Experience</span><b>{o.experienceYearsMin != null ? `${o.experienceYearsMin}+ yrs` : "—"}</b></div>
            <div className="kvline"><span>Created</span><b>{fmt(o.createdAt)}</b></div>
            <div className="tag-row tag-row-sm" style={{ marginTop: 8 }}>{o.skills.map((s) => <span key={s.name} className={"tag tag-sm" + (s.required ? "" : " tag-adv")}>{s.name}</span>)}</div>
          </div>

          {/* Client activity */}
          <div className="panel">
            <div className="panel-title"><Icon name="building" size={14} /> Client activity</div>
            <div className="kvline"><span>Last action</span><b>{ws.clientActivity.lastAction ? `${ws.clientActivity.lastAction.type.replace("_", " ")} · ${ws.clientActivity.lastAction.candidate ?? ""}` : "—"}</b></div>
            <div className="kvline"><span>Pending approvals</span><b>{ws.clientActivity.pendingApprovals}</b></div>
            <div style={{ marginTop: 6 }}>
              {ws.clientActivity.shares.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--mute)" }}>No share links yet.</div> :
                ws.clientActivity.shares.map((s) => (
                  <div key={s.token} className="kvline">
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontFamily: "var(--mono)" }}>{s.label ?? s.url}</a>
                    <b>{s.revoked ? "revoked" : `${s.views} views`}</b>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobAIPanel({ jobId, onOpenCandidate, onChanged }: { jobId: string; onOpenCandidate: (id: string, jobId?: string) => void; onChanged: () => void }) {
  const [items, setItems] = useState<{ role: "user" | "ai"; text: string; resp?: ChatResponse }[]>([]);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [items]);

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setItems((m) => [...m, { role: "user", text }]);
    setVal(""); setBusy(true);
    try {
      const resp = await api.chat(text, { jobId });
      setItems((m) => [...m, { role: "ai", text: resp.reply, resp }]);
      if (["submit_result", "share_result"].includes(resp.kind)) onChanged();
    } finally { setBusy(false); }
  }

  const chips = ["Who is the safest candidate?", "Compare the top 3", "Only candidates with strong English", "What's pending?"];

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
      <div className="panel-title"><Icon name="spark" size={14} /> Ask about this job</div>
      <div className="ws-ai-log">
        {items.length === 0 && <div className="tag-row tag-row-sm">{chips.map((c) => <button key={c} className="chip" onClick={() => ask(c)}>{c}</button>)}</div>}
        {items.map((m, i) => (
          <div key={i} className={m.role === "user" ? "msg msg-user" : "msg msg-ai"}>
            {m.role === "user" ? <div className="user-bubble" style={{ fontSize: 13 }}>{m.text}</div> :
              <div className="msg-body" style={{ fontSize: 13.5 }}>
                <div>{m.text}</div>
                {m.resp && <MiniResult resp={m.resp} onOpenCandidate={(id) => onOpenCandidate(id, jobId)} />}
              </div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="add-note" style={{ marginTop: 10 }}>
        <input placeholder="Ask anything about this role…" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(val)} />
        <button className="btn btn-primary" onClick={() => ask(val)} disabled={busy || !val.trim()}><Icon name="arrowUp" size={15} /></button>
      </div>
    </div>
  );
}

function MiniResult({ resp, onOpenCandidate }: { resp: ChatResponse; onOpenCandidate: (id: string) => void }) {
  const d = resp.data as Record<string, unknown>;
  const list = (d.list as { id: string; name: string; matchScore?: number; score?: number }[]) ?? null;
  const cards = (d.cards as { id: string; name: string; matchScore: number }[]) ?? null;
  const rows = list ?? cards;
  if (!rows) return null;
  return (
    <div className="cres-list" style={{ marginTop: 8 }}>
      {rows.slice(0, 5).map((c) => (
        <button key={c.id} className="cres" style={{ padding: "8px 11px" }} onClick={() => onOpenCandidate(c.id)}>
          <div className="cres-main"><div className="cres-name" style={{ fontSize: 13.5 }}>{c.name}</div></div>
          <span className="pill pill-accent">{(c as { matchScore?: number; score?: number }).matchScore ?? (c as { score?: number }).score ?? ""}</span>
        </button>
      ))}
    </div>
  );
}

function OffersPanel({ ws, onChanged }: { ws: WS; onChanged: () => void }) {
  const [composing, setComposing] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [rate, setRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const jobId = ws.overview.id;
  // Candidates eligible for an offer: those in the pipeline who don't already
  // have an open offer. We surface the top-candidate list as the picker source.
  const openCandidateIds = new Set(ws.offers.filter((o) => o.status === "draft" || o.status === "sent").map((o) => o.candidateId));
  const candidates = ws.topCandidates.filter((c) => !openCandidateIds.has(c.id));

  const extend = async () => {
    if (!candidateId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const body: { candidateId: string; jobId: string; clientRate?: number; startDate?: string } = { candidateId, jobId };
      if (rate.trim()) body.clientRate = Number(rate);
      if (startDate) body.startDate = new Date(startDate + "T09:00:00").toISOString();
      const res = await api.createOffer(body);
      if (res.error) {
        setErr(res.error);
      } else {
        setComposing(false);
        setCandidateId("");
        setRate("");
        setStartDate("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const respond = async (id: string, status: string) => {
    setBusy(true);
    try {
      await api.updateOffer(id, { status });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-title" style={{ display: "flex", alignItems: "center" }}>
        <Icon name="briefcase" size={14} /> Offers
        <button className="suggest-mini" style={{ marginLeft: "auto" }} onClick={() => setComposing((v) => !v)} disabled={candidates.length === 0}>
          {composing ? "Cancel" : "Extend offer"}
        </button>
      </div>

      {composing && (
        <div style={{ display: "grid", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)", marginBottom: 8 }}>
          <select className="mc-in" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
            <option value="">Select a candidate…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.clientRate != null ? ` · $${c.clientRate}/hr` : ""}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="mc-in" placeholder="Rate $/hr" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} style={{ width: 120 }} />
            <input className="mc-in" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {err && <div className="banner banner-bad" style={{ fontSize: 12.5 }}>{err}</div>}
          <button className="btn btn-primary" onClick={extend} disabled={busy || !candidateId}>{busy ? "Sending…" : "Send offer"}</button>
        </div>
      )}

      {ws.offers.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--mute)" }}>No offers yet.</div>
      ) : (
        ws.offers.map((o) => (
          <div key={o.id} className="note-item">
            <div className="note-meta">
              {o.candidate} · <Pill tone={OFFER_TONE[o.status] ?? "default"}>{o.status}</Pill>
              {o.clientRate != null ? ` · $${o.clientRate}/hr` : ""}
              {o.startDate ? ` · starts ${fmt(o.startDate)}` : ""}
            </div>
            {(o.status === "sent" || o.status === "draft") && (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="suggest-mini" onClick={() => respond(o.id, "accepted")} disabled={busy}>Mark accepted</button>
                <button className="suggest-mini" onClick={() => respond(o.id, "declined")} disabled={busy}>Declined</button>
                <button className="suggest-mini" onClick={() => respond(o.id, "withdrawn")} disabled={busy}>Withdraw</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function fmt(iso: string) { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
