"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, MatchRing, Pill, initialsOf, AVAILABILITY_LABEL, FreshnessBadge, ScoreBreakdown } from "@/components/primitives";
import { api, CandidateDetail, WritingQuality } from "@/lib/client/api";

const STABILITY_LABEL: Record<string, string> = {
  stable: "Stable",
  moderate: "Moderate",
  job_hopper: "Job-hopper",
  insufficient: "No history",
};

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
  const [schedulePanel, setSchedulePanel] = useState<{ rescheduleId?: string } | null>(null);
  const [candidateLinkMsg, setCandidateLinkMsg] = useState<string | null>(null);
  const [writing, setWriting] = useState<{ available: boolean; reason?: string; writing: WritingQuality | null } | null>(null);

  const load = useCallback(() => {
    api.candidate(candidateId, jobId).then(setData).catch(() => setError("Could not load candidate."));
  }, [candidateId, jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // Lazy AI writing/spelling analysis — fetched after the profile renders so it
  // never blocks the main load.
  useEffect(() => {
    setWriting(null);
    api.candidateWriting(candidateId).then(setWriting).catch(() => setWriting({ available: false, writing: null }));
  }, [candidateId]);

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

  const targetJobId = jobId || data?.pipelines[0]?.jobId || null;

  async function submitSchedule(opts: { scheduledFor?: string; proposedSlots?: string[]; timezone: string; durationMins: number; meetingUrl?: string }) {
    if (schedulePanel?.rescheduleId) {
      if (!opts.scheduledFor) return;
      await api.rescheduleInterview(schedulePanel.rescheduleId, opts.scheduledFor, opts.meetingUrl);
      setScheduleMsg("Rescheduled");
      setSchedulePanel(null);
      load();
      return;
    }
    if (!targetJobId) {
      setScheduleMsg("No job in pipeline");
      return;
    }
    const res = await api.scheduleInterview(candidateId, targetJobId, opts);
    if (res.interviewId) {
      setScheduleMsg(res.status === "proposed" ? `Proposed ${res.proposedSlots?.length ?? 0} time(s)` : `Scheduled · reminders: ${res.reminders?.join(", ") || "none"}`);
      setSchedulePanel(null);
      load();
    } else {
      setScheduleMsg(res.error || "Failed");
    }
  }

  async function candidateLink() {
    const res = await api.createCandidateAccess(candidateId, targetJobId ?? undefined);
    if (res.url) {
      const full = `${location.origin}${res.url}`;
      try {
        await navigator.clipboard.writeText(full);
        setCandidateLinkMsg("Candidate link copied");
      } catch {
        setCandidateLinkMsg(full);
      }
      setTimeout(() => setCandidateLinkMsg(null), 4000);
    } else {
      setCandidateLinkMsg(res.error || "Failed");
    }
  }

  // Quick-action launcher: opens the channel AND logs the contact (Mission 5.1 P4).
  async function logContact(kind: "call" | "email" | "whatsapp", href: string | null) {
    if (href) window.open(href, "_blank");
    await api.addNote(candidateId, { body: `${kind} initiated from ANVI`, kind, internal: false, jobId });
    load();
  }
  async function confirmAvailability() {
    await api.editCandidate(candidateId, { confirmAvailability: true });
    load();
  }
  async function archiveOrRestore() {
    if (data?.candidate.archived) await api.restoreCandidate(candidateId);
    else await api.archiveCandidate(candidateId);
    load();
  }
  async function removeCandidate() {
    if (!confirm("Soft-delete this candidate? It can be restored later.")) return;
    await api.deleteCandidate(candidateId);
    onBack();
  }
  function rescheduleIv(id: string) {
    setScheduleMsg(null);
    setSchedulePanel({ rescheduleId: id });
  }
  async function cancelIv(id: string) {
    const reason = prompt("Cancel reason?") || undefined;
    await api.cancelInterview(id, reason);
    load();
  }
  async function delNote(id: string) {
    await api.deleteNote(id);
    load();
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
            {data.availabilityScore && (
              <Pill tone={data.availabilityScore.band === "high" ? "good" : data.availabilityScore.band === "low" ? "bad" : "warn"}>
                Availability {data.availabilityScore.score}%
              </Pill>
            )}
            {data.communicationHealth && (
              <Pill tone={data.communicationHealth.band === "green" ? "good" : data.communicationHealth.band === "yellow" ? "warn" : "bad"}>
                {data.communicationHealth.daysSinceContact == null ? "never contacted" : `contacted ${data.communicationHealth.daysSinceContact}d ago`}
              </Pill>
            )}
            {c.source && <Pill tone="default">{c.source}</Pill>}
          </div>

          {/* Quick actions — one click to reach the candidate, logged automatically (P4) */}
          <div className="qa-row" style={{ marginTop: 12 }}>
            <button className="qa" onClick={() => logContact("call", c.phone ? `tel:${c.phone}` : null)}><Icon name="user" size={13} /> Call</button>
            <button className="qa" onClick={() => logContact("email", c.email ? `mailto:${c.email}` : null)}><Icon name="message" size={13} /> Email</button>
            <button className="qa" onClick={() => logContact("whatsapp", c.phone ? `https://wa.me/${c.phone.replace(/\D/g, "")}` : null)}><Icon name="message" size={13} /> WhatsApp</button>
            <button className="qa" onClick={() => { setScheduleMsg(null); setSchedulePanel({}); }}><Icon name="calendar" size={13} /> Schedule</button>
            <button className="qa" onClick={candidateLink}><Icon name="share" size={13} /> {candidateLinkMsg ?? "Candidate link"}</button>
            <button className="qa" onClick={confirmAvailability}><Icon name="check" size={13} /> Confirm availability</button>
            <button className="qa" onClick={archiveOrRestore}>{c.archived ? "Restore" : "Archive"}</button>
            <button className="qa" onClick={removeCandidate} style={{ color: "var(--bad)" }}><Icon name="x" size={13} /> Delete</button>
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

          {/* Insights: stability / notable employers / writing quality */}
          <div className="panel">
            <div className="panel-title"><Icon name="bolt" size={14} /> Insights</div>
            {data.stability && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--mute)" }}>Stability</span>
                  {data.stability.score == null ? (
                    <Pill tone="default">No history</Pill>
                  ) : (
                    <Pill tone={data.stability.band === "stable" ? "good" : data.stability.band === "moderate" ? "warn" : "bad"}>
                      {STABILITY_LABEL[data.stability.band]} · {data.stability.score}/100
                    </Pill>
                  )}
                  {data.stability.avgTenureMonths != null && (
                    <span style={{ fontSize: 12, color: "var(--mute)" }}>avg tenure ~{(data.stability.avgTenureMonths / 12).toFixed(1)}y · {data.stability.roles} role{data.stability.roles === 1 ? "" : "s"}</span>
                  )}
                </div>
                {data.stability.reasons.length > 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>{data.stability.reasons.join(" ")}</div>
                )}
              </div>
            )}
            {data.notableEmployers && data.notableEmployers.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: "var(--mute)", marginBottom: 4 }}>Recognised employers</div>
                <div className="tag-row tag-row-sm">
                  {data.notableEmployers.map((e, i) => (
                    <Pill key={i} tone="good">⭐ {e.matched}</Pill>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--mute)" }}>CV writing</span>
                {!writing ? (
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>analyzing…</span>
                ) : !writing.available || !writing.writing ? (
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>{writing?.reason === "ai_disabled" ? "AI disabled" : "not analyzed"}</span>
                ) : (
                  <Pill tone={writing.writing.band === "clean" ? "good" : writing.writing.band === "minor" ? "warn" : "bad"}>
                    {writing.writing.issues === 0 ? "No spelling issues" : `${writing.writing.issues} spelling/grammar issue${writing.writing.issues === 1 ? "" : "s"}`}
                  </Pill>
                )}
              </div>
              {writing?.writing && writing.writing.assessment && (
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>{writing.writing.assessment}</div>
              )}
              {writing?.writing && writing.writing.examples.length > 0 && (
                <ul style={{ margin: "4px 0 0 16px", fontSize: 12, color: "var(--ink-soft)" }}>
                  {writing.writing.examples.slice(0, 5).map((ex, i) => (
                    <li key={i}><s>{ex.wrong}</s> → {ex.suggestion}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Candidate Intelligence (Mission 10 Phase 2) */}
          {data.intelligence && <IntelligencePanel intel={data.intelligence} />}

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
                  <button className="note-del" title="Delete note" onClick={() => delNote(n.id)}><Icon name="x" size={11} /></button>
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {scheduleMsg && <span style={{ fontSize: 11, color: "var(--good)" }}>{scheduleMsg}</span>}
                <button className="suggest-mini" onClick={() => { setScheduleMsg(null); setSchedulePanel({}); }}><Icon name="calendar" size={12} /> Schedule screening</button>
              </span>
            </div>
            {schedulePanel && (
              <SchedulePanel
                reschedule={Boolean(schedulePanel.rescheduleId)}
                onCancel={() => setSchedulePanel(null)}
                onSubmit={submitSchedule}
              />
            )}
            {data.interviews.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--mute)" }}>No interviews recorded yet.</div>
            ) : (
              data.interviews.map((iv) => {
                const actions = Array.isArray(iv.actionItems) ? (iv.actionItems as string[]) : [];
                return (
                  <div key={iv.id} className="note-item">
                    <div className="note-meta">
                      {iv.outcome ?? "Interview"} · {iv.completedAt ? fmt(iv.completedAt) : iv.scheduledFor ? `${fmt(iv.scheduledFor)} ${iv.timezone ?? ""}` : "scheduled"}
                      <span className="note-kind">{iv.status ?? "scheduled"}</span>
                      <span className={"note-kind"} title="Webhook status">{iv.webhookStatus ?? "none"}</span>
                    </div>
                    {iv.summary && <div style={{ fontSize: 13.5 }}>{iv.summary}</div>}
                    {actions.length > 0 && (
                      <ul style={{ margin: "6px 0 0 16px", fontSize: 12.5, color: "var(--ink-soft)" }}>
                        {actions.slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      {iv.meetingUrl && iv.status !== "cancelled" && (
                        <a href={iv.meetingUrl} className="suggest-mini" target="_blank" rel="noreferrer">
                          <Icon name="video" size={13} /> Join meeting ({iv.meetingProvider})
                        </a>
                      )}
                      {iv.recordingUrl && (
                        <a href={iv.recordingUrl} className="suggest-mini" target="_blank" rel="noreferrer">
                          <Icon name="video" size={13} /> Watch recording
                        </a>
                      )}
                      {iv.status !== "cancelled" && !iv.completedAt && (
                        <>
                          <button className="suggest-mini" onClick={() => rescheduleIv(iv.id)}>Reschedule</button>
                          <button className="suggest-mini" onClick={() => cancelIv(iv.id)} style={{ color: "var(--bad)" }}>Cancel</button>
                        </>
                      )}
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

function names(arr: unknown[]): string[] {
  return (arr ?? []).map((x) => (typeof x === "string" ? x : (x as { name?: string; lang?: string })?.name ?? (x as { lang?: string })?.lang ?? "")).filter(Boolean);
}

function IntelligencePanel({ intel }: { intel: import("@/lib/client/api").CandidateIntelligenceView }) {
  const row = (label: string, vals: string[]) => (vals.length ? (
    <div className="kvline" style={{ alignItems: "flex-start" }}>
      <span>{label}</span>
      <div className="tag-row tag-row-sm" style={{ justifyContent: "flex-end" }}>{vals.slice(0, 10).map((v) => <span key={v} className="tag tag-sm">{v}</span>)}</div>
    </div>
  ) : null);
  const flags: string[] = [];
  if (intel.startupExp) flags.push("startup");
  if (intel.enterpriseExp) flags.push("enterprise");
  if (intel.consultingExp) flags.push("consulting");
  if (intel.teamLeadership) flags.push("leadership");
  if (intel.hiringExp) flags.push("hiring");
  if (intel.mentoringExp) flags.push("mentoring");
  if (intel.remoteExperience) flags.push("remote");
  if (intel.militaryExp) flags.push("military");
  return (
    <div className="panel">
      <div className="panel-title" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="spark" size={14} /> Candidate intelligence</span>
        <span style={{ fontSize: 11, color: "var(--mute)" }}>{intel.source}{intel.confidence != null ? ` · ${intel.confidence}% conf` : ""}</span>
      </div>
      {row("Languages", names(intel.languages))}
      {row("Frameworks", names(intel.frameworks))}
      {row("Databases", names(intel.databases))}
      {row("Cloud", names(intel.cloudProviders))}
      {row("DevOps", names(intel.devopsTools))}
      {row("AI/ML", names(intel.aimlTools))}
      {row("Architecture", names(intel.architectureExp))}
      {row("Industries", names(intel.industries))}
      {row("Company sizes", names(intel.companySizes))}
      {flags.length > 0 && row("Experience", flags)}
      {intel.managementYears != null && <div className="kvline"><span>Management</span><b>{intel.managementYears}y{intel.maxTeamSize ? ` · team ${intel.maxTeamSize}` : ""}</b></div>}
      {(intel.city || intel.timezone) && <div className="kvline"><span>Location</span><b>{[intel.city, intel.timezone].filter(Boolean).join(" · ")}</b></div>}
      {intel.relocationWilling != null && <div className="kvline"><span>Relocation</span><b>{intel.relocationWilling ? "willing" : "no"}</b></div>}
      {intel.englishConfidence != null && <div className="kvline"><span>English confidence</span><b>{intel.englishConfidence}%</b></div>}
      {row("Certifications", names(intel.certifications))}
      {names(intel.education).length > 0 && row("Education", names(intel.education).concat((intel.education as { degree?: string; field?: string }[]).map((e) => [e.degree, e.field].filter(Boolean).join(" ")).filter(Boolean)).slice(0, 4))}
      {intel.source === "deterministic" && <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 6 }}>Deterministic only — enable AI + re-import for full extraction.</div>}
    </div>
  );
}

const COMMON_TZ = ["UTC", "Europe/Kyiv", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore"];

// Real scheduling panel (Mission 8 Phase 2): recruiter picks date + time +
// timezone, optionally proposes multiple slots, and may paste a REAL meeting link.
function SchedulePanel({
  reschedule,
  onCancel,
  onSubmit,
}: {
  reschedule: boolean;
  onCancel: () => void;
  onSubmit: (opts: { scheduledFor?: string; proposedSlots?: string[]; timezone: string; durationMins: number; meetingUrl?: string }) => void;
}) {
  const guessTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  })();
  const [mode, setMode] = useState<"fixed" | "propose">("fixed");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [timezone, setTimezone] = useState(COMMON_TZ.includes(guessTz) ? guessTz : "UTC");
  const [durationMins, setDurationMins] = useState(45);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("10:00");
  const [busy, setBusy] = useState(false);

  // Interpret the wall-clock date/time in the chosen timezone → a correct UTC ISO.
  const toIso = (d: string, t: string): string | null => {
    if (!d || !t) return null;
    const naive = new Date(`${d}T${t}:00`);
    if (Number.isNaN(naive.getTime())) return null;
    try {
      const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
      const inTz = new Date(naive.toLocaleString("en-US", { timeZone: timezone }));
      const offset = asUtc.getTime() - inTz.getTime();
      return new Date(naive.getTime() + offset).toISOString();
    } catch {
      return naive.toISOString();
    }
  };

  const addSlot = () => {
    const iso = toIso(slotDate, slotTime);
    if (iso && !slots.includes(iso)) setSlots((s) => [...s, iso].slice(0, 5));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const base = { timezone, durationMins, meetingUrl: meetingUrl.trim() || undefined };
      if (reschedule || mode === "fixed") {
        const iso = toIso(date, time);
        if (!iso) {
          setBusy(false);
          return;
        }
        onSubmit({ ...base, scheduledFor: iso });
      } else {
        if (slots.length === 0) {
          setBusy(false);
          return;
        }
        onSubmit({ ...base, proposedSlots: slots });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, margin: "8px 0", display: "grid", gap: 10 }}>
      {!reschedule && (
        <div className="view-filters">
          <button className="chip" data-active={mode === "fixed" ? "" : undefined} onClick={() => setMode("fixed")}>Set a time</button>
          <button className="chip" data-active={mode === "propose" ? "" : undefined} onClick={() => setMode("propose")}>Propose slots</button>
        </div>
      )}

      {(reschedule || mode === "fixed") ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="mc-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="mc-in" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 120 }} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="mc-in" type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
            <input className="mc-in" type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} style={{ width: 120 }} />
            <button className="btn btn-ghost" onClick={addSlot} disabled={!slotDate}>+ Add slot</button>
          </div>
          {slots.length > 0 && (
            <div className="tag-row tag-row-sm">
              {slots.map((s) => (
                <span key={s} className="tag tag-sm">
                  {new Date(s).toLocaleString()} <button onClick={() => setSlots((x) => x.filter((y) => y !== s))} style={{ marginLeft: 4 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="mc-in" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {COMMON_TZ.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        <select className="mc-in" value={durationMins} onChange={(e) => setDurationMins(Number(e.target.value))}>
          {[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
        </select>
      </div>

      <input className="mc-in" placeholder="Paste a real meeting link (Zoom/Meet) — optional" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />
      {!meetingUrl.trim() && <div style={{ fontSize: 11.5, color: "var(--mute)" }}>No link pasted — the client sees “joining details will be shared before the call” (no fake links).</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{reschedule ? "Reschedule" : mode === "fixed" ? "Schedule" : "Propose slots"}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
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
