"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, MatchRing, Pill, initialsOf, AVAILABILITY_LABEL, FreshnessBadge, ScoreBreakdown } from "@/components/primitives";
import { api, CandidateDetail } from "@/lib/client/api";

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  screened: "Screened",
  sent_to_client: "Sent to client",
  interview: "Interview",
  approved: "Approved",
  rejected: "Rejected",
  hired: "Hired",
};

export function CandidateProfile({
  candidateId,
  jobId,
  onBack,
}: {
  candidateId: string;
  jobId?: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api.candidate(candidateId, jobId).then(setData).catch(() => setError("Could not load candidate."));
  }, [candidateId, jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote() {
    if (!noteBody.trim()) return;
    await api.addNote(candidateId, {
      body: noteBody.trim(),
      kind: noteKind,
      internal: noteKind === "note",
      jobId,
    });
    setNoteBody("");
    load();
  }

  async function scheduleScreening() {
    const targetJob = jobId || data?.pipelines[0]?.jobId;
    if (!targetJob) {
      setScheduleMsg("No job in pipeline");
      return;
    }
    const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // +2 days
    const res = await api.scheduleInterview(candidateId, targetJob, when);
    if (res.interviewId) {
      setScheduleMsg(`Scheduled · reminders: ${res.reminders?.join(", ") || "none"}`);
      load();
    } else {
      setScheduleMsg(res.error || "Failed");
    }
  }

  async function share(forJobId: string) {
    setShareMsg(null);
    const res = await api.createShare(forJobId, [{ candidateId, shareNotes: false }], "Quick share");
    if (res.url) {
      const full = `${location.origin}${res.url}`;
      try {
        await navigator.clipboard.writeText(full);
        setShareMsg(`Client link copied: ${res.url}`);
      } catch {
        setShareMsg(`Client link: ${full}`);
      }
    }
  }

  if (error) return <div className="profile"><div className="banner banner-bad">{error}</div></div>;
  if (!data) return <div className="profile"><div className="loading">Loading profile…</div></div>;

  const c = data.candidate;
  const a = data.analysis;

  return (
    <div className="profile">
      <button className="profile-back" onClick={onBack}>
        <Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back
      </button>

      <div className="profile-head">
        <Avatar initials={initialsOf(c.name)} flag={c.flag} size={56} />
        <div style={{ flex: 1 }}>
          <div className="profile-name">{c.name}</div>
          <div className="profile-role">
            {[c.title, c.location && c.country ? `${c.location}, ${c.country}` : c.country].filter(Boolean).join(" · ")}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill tone={c.availability === "available" ? "good" : c.availability === "placed" ? "bad" : "warn"}>
              {AVAILABILITY_LABEL[c.availability] ?? c.availability}
              {c.availabilityNote ? ` · ${c.availabilityNote}` : ""}
            </Pill>
            {c.english && <Pill tone="default">{c.english} English</Pill>}
            {c.clientRate != null && <Pill tone="accent">${c.clientRate}/hr client</Pill>}
            {c.salaryExpectation != null && <Pill tone="default">${c.salaryExpectation}/hr cost</Pill>}
            {data.freshness && (
              <FreshnessBadge band={data.freshness.band} label={data.freshness.label} days={data.freshness.daysSinceUpdated} />
            )}
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-main">
          {c.aiSummary && (
            <div className="panel">
              <div className="panel-title"><Icon name="spark" size={14} /> AI summary</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-soft)" }}>{c.aiSummary}</div>
            </div>
          )}

          {/* Anomalies */}
          {data.anomalies.length > 0 && (
            <div className="panel">
              <div className="panel-title" style={{ color: "var(--bad)" }}>
                <Icon name="alert" size={14} /> Anomalies ({data.anomalies.length})
              </div>
              <div className="intel-list">
                {data.anomalies.map((an, i) => (
                  <div key={i} className="intel intel-bad">
                    <span className="intel-ic">🔴</span>
                    <div>{an.text}<span className="intel-rule">{an.rule}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths / Risks */}
          {a && (a.strengths.length > 0 || a.risks.length > 0) && (
            <div className="panel">
              <div className="panel-title"><Icon name="bolt" size={14} /> Strengths &amp; risks</div>
              <div className="intel-list">
                {a.strengths.map((s, i) => (
                  <div key={"s" + i} className="intel intel-good">
                    <span className="intel-ic">✅</span>
                    <div>{s.text}{s.evidence && <span className="intel-ev">{s.evidence}</span>}</div>
                  </div>
                ))}
                {a.risks.map((r, i) => (
                  <div key={"r" + i} className={"intel " + (r.severity === "high" ? "intel-bad" : "intel-warn")}>
                    <span className="intel-ic">⚠️</span>
                    <div>{r.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Communication history + notes */}
          <div className="panel">
            <div className="panel-title"><Icon name="message" size={14} /> Communication &amp; notes</div>
            {data.notes.length === 0 && <div style={{ fontSize: 13, color: "var(--mute)" }}>No notes yet.</div>}
            {data.notes.map((n) => (
              <div key={n.id} className="note-item">
                <div className="note-meta">
                  <span className="note-kind">{n.kind}</span>
                  <span className={n.internal ? "note-int" : "note-pub"}>{n.internal ? "internal" : "client-safe"}</span>
                  <span>· {n.author ?? "—"} · {fmt(n.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13.5 }}>{n.body}</div>
              </div>
            ))}
            <div className="add-note">
              <select value={noteKind} onChange={(e) => setNoteKind(e.target.value)}>
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <input
                placeholder="Add a note or log a contact…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNote()}
              />
              <button className="btn btn-primary" onClick={addNote} disabled={!noteBody.trim()}>
                Add
              </button>
            </div>
          </div>

          {/* Interviews (TimeOS/Timeless) */}
          <div className="panel">
            <div className="panel-title" style={{ justifyContent: "space-between" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="video" size={14} /> Interviews</span>
              {scheduleMsg ? (
                <span style={{ fontSize: 11, color: "var(--good)" }}>{scheduleMsg}</span>
              ) : (
                <button className="suggest-mini" onClick={scheduleScreening}><Icon name="calendar" size={12} /> Schedule screening</button>
              )}
            </div>
            {data.interviews.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--mute)" }}>No interviews recorded yet.</div>
            ) : (
              data.interviews.map((iv) => {
                const actions = Array.isArray(iv.actionItems) ? (iv.actionItems as string[]) : [];
                return (
                  <div key={iv.id} className="note-item">
                    <div className="note-meta">
                      {iv.outcome ?? "Interview"} · {iv.completedAt ? fmt(iv.completedAt) : iv.scheduledFor ? `scheduled ${fmt(iv.scheduledFor)}` : "scheduled"}
                      {iv.provider && <span className="note-kind">{iv.provider}</span>}
                      <span className={"note-kind"} title="Webhook status">{iv.webhookStatus ?? "none"}</span>
                    </div>
                    {iv.summary && <div style={{ fontSize: 13.5 }}>{iv.summary}</div>}
                    {actions.length > 0 && (
                      <ul style={{ margin: "6px 0 0 16px", fontSize: 12.5, color: "var(--ink-soft)" }}>
                        {actions.slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      {iv.recordingUrl && (
                        <a href={iv.recordingUrl} className="suggest-mini" target="_blank" rel="noreferrer">
                          <Icon name="video" size={13} /> Watch recording
                        </a>
                      )}
                      <span className="suggest-mini" style={{ cursor: "default" }}>
                        Transcript: {iv.transcriptAvailable ? "available" : "—"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Employment */}
          {c.employments.length > 0 && (
            <div className="panel">
              <div className="panel-title"><Icon name="briefcase" size={14} /> Employment history</div>
              {c.employments.map((e, i) => (
                <div key={i} className="emp">
                  <div className="emp-top">
                    <span>{e.title ?? "—"}</span>
                    <span style={{ color: "var(--mute)", fontWeight: 500 }}>
                      {fmtMonth(e.startDate)} – {e.endDate ? fmtMonth(e.endDate) : "Present"}
                    </span>
                  </div>
                  <div className="emp-sub">{e.company}{!e.fullTime ? " · part-time" : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side column */}
        <div className="profile-side">
          {a && (
            <div className="panel">
              <div className="panel-title"><Icon name="sparkle2" size={14} /> Match</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <MatchRing score={a.matchScore} size={54} />
                <div>
                  <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{a.recommendation} fit</div>
                  <div style={{ fontSize: 12.5, color: "var(--mute)" }}>vs. matched role</div>
                </div>
              </div>
              {a.scoreBreakdown && a.scoreBreakdown.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="sect-label"><Icon name="sliders" size={13} /> Why this score</div>
                  <ScoreBreakdown items={a.scoreBreakdown} />
                </div>
              )}
            </div>
          )}

          {/* Matched jobs / pipeline */}
          <div className="panel">
            <div className="panel-title"><Icon name="briefcase" size={14} /> Matched jobs</div>
            {data.pipelines.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--mute)" }}>Not in any pipeline yet.</div>
            ) : (
              data.pipelines.map((p) => (
                <div key={p.jobId} className="kvline" style={{ alignItems: "center" }}>
                  <span>
                    <b style={{ color: "var(--ink)" }}>{p.jobTitle}</b>
                    <br />
                    <span style={{ fontSize: 12 }}>{p.client ?? "—"}</span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <Pill tone={p.stage === "approved" || p.stage === "hired" ? "good" : p.stage === "rejected" ? "bad" : "accent"}>
                      {STAGE_LABEL[p.stage] ?? p.stage}
                    </Pill>
                    <button className="suggest-mini" onClick={() => share(p.jobId)}>
                      <Icon name="link" size={12} /> Client link
                    </button>
                  </span>
                </div>
              ))
            )}
            {shareMsg && <div className="banner banner-good" style={{ marginTop: 10, fontSize: 11.5 }}>{shareMsg}</div>}
          </div>

          {/* Skills */}
          <div className="panel">
            <div className="panel-title"><Icon name="bolt" size={14} /> Skills</div>
            <div className="tag-row tag-row-sm">
              {c.skills.map((s) => (
                <span key={s.name} className="tag tag-sm">{s.name} · {s.years}y</span>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="panel">
            <div className="panel-title"><Icon name="clock" size={14} /> Timeline</div>
            <div className="kvline"><span>Created</span><b>{fmt(c.createdAt)}</b></div>
            <div className="kvline"><span>Updated</span><b>{rel(c.updatedAt)}</b></div>
            {c.lastContactedAt && <div className="kvline"><span>Last contact</span><b>{rel(c.lastContactedAt)}</b></div>}
            {c.lastScreenedAt && <div className="kvline"><span>Screened</span><b>{rel(c.lastScreenedAt)}</b></div>}
            <div className="kvline"><span>Source</span><b>{c.source ?? "—"}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short" });
}
function rel(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}
