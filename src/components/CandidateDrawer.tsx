"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, MatchRing, Pill, initialsOf, AVAILABILITY_LABEL, FreshnessBadge, ScoreBreakdown } from "@/components/primitives";
import { api, CandidateDetail } from "@/lib/client/api";

export function CandidateDrawer({
  candidateId,
  jobId,
  onClose,
}: {
  candidateId: string;
  jobId?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    api
      .candidate(candidateId, jobId)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError("Could not load candidate."));
    return () => {
      alive = false;
    };
  }, [candidateId, jobId]);

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer">
        <button className="drawer-x" onClick={onClose} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
        {error && <div className="loading">{error}</div>}
        {!data && !error && <div className="loading">Loading candidate…</div>}
        {data && <DrawerContent data={data} />}
      </aside>
    </>
  );
}

function DrawerContent({ data }: { data: CandidateDetail }) {
  const c = data.candidate;
  const a = data.analysis;
  return (
    <>
      <div className="drawer-head">
        <Avatar initials={initialsOf(c.name)} flag={c.flag} size={48} />
        <div className="drawer-id">
          <div className="drawer-name">{c.name}</div>
          <div className="drawer-role">
            {[c.title, c.location && c.country ? `${c.location}, ${c.country}` : c.country].filter(Boolean).join(" · ")}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill tone={c.availability === "available" ? "good" : c.availability === "placed" ? "bad" : "warn"}>
              {AVAILABILITY_LABEL[c.availability] ?? c.availability}
              {c.availabilityNote ? ` · ${c.availabilityNote}` : ""}
            </Pill>
            {c.english && <Pill tone="default">{c.english} English</Pill>}
            {c.clientRate != null && <Pill tone="accent">${c.clientRate}/hr</Pill>}
            {data.freshness && (
              <FreshnessBadge band={data.freshness.band} label={data.freshness.label} days={data.freshness.daysSinceUpdated} />
            )}
          </div>
        </div>
      </div>

      <div className="drawer-body">
        {a && (
          <div className="drawer-score">
            <MatchRing score={a.matchScore} size={54} />
            <div className="drawer-score-txt">
              <div style={{ fontSize: 13, color: "var(--mute)" }}>Match score for the active role</div>
              <div className="drawer-score-rec" style={{ color: recColor(a.recommendation) }}>
                {a.recommendation} fit
              </div>
            </div>
          </div>
        )}

        {/* Why this score — explainable breakdown (Part 3: no black box) */}
        {a?.scoreBreakdown && a.scoreBreakdown.length > 0 && (
          <div>
            <div className="sect-label">
              <Icon name="sliders" size={14} /> Why this score
            </div>
            <ScoreBreakdown items={a.scoreBreakdown} />
          </div>
        )}

        {c.aiSummary && (
          <div>
            <div className="sect-label">
              <Icon name="spark" size={14} /> AI summary
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-soft)" }}>{c.aiSummary}</div>
          </div>
        )}

        {/* ANOMALIES — the flagship red category */}
        {data.anomalies.length > 0 && (
          <div>
            <div className="sect-label" style={{ color: "var(--bad)" }}>
              <Icon name="alert" size={14} /> Anomalies ({data.anomalies.length})
            </div>
            <div className="intel-list">
              {data.anomalies.map((an, i) => (
                <div key={i} className="intel intel-bad">
                  <span className="intel-ic">🔴</span>
                  <div>
                    {an.text}
                    <span className="intel-rule">{an.rule}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {a && a.strengths.length > 0 && (
          <div>
            <div className="sect-label" style={{ color: "var(--good)" }}>
              <Icon name="check" size={14} /> Strengths
            </div>
            <div className="intel-list">
              {a.strengths.map((s, i) => (
                <div key={i} className="intel intel-good">
                  <span className="intel-ic">✅</span>
                  <div>
                    {s.text}
                    {s.evidence && <span className="intel-ev">{s.evidence}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {a && a.risks.length > 0 && (
          <div>
            <div className="sect-label" style={{ color: "var(--warn)" }}>
              <Icon name="warn" size={14} /> Risks
            </div>
            <div className="intel-list">
              {a.risks.map((r, i) => (
                <div key={i} className={"intel " + (r.severity === "high" ? "intel-bad" : "intel-warn")}>
                  <span className="intel-ic">{r.severity === "high" ? "⚠️" : "⚠"}</span>
                  <div>{r.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!a && (
          <div className="banner banner-info">
            <Icon name="spark" size={13} /> Open this candidate from a match to see role-specific strengths & risks.
          </div>
        )}

        {/* Skills */}
        <div>
          <div className="sect-label">
            <Icon name="bolt" size={14} /> Skills
          </div>
          <div className="tag-row tag-row-sm">
            {c.skills.map((s) => (
              <span key={s.name} className="tag tag-sm">
                {s.name} · {s.years}y
              </span>
            ))}
          </div>
        </div>

        {/* Employment history */}
        {c.employments.length > 0 && (
          <div>
            <div className="sect-label">
              <Icon name="briefcase" size={14} /> Employment history
            </div>
            {c.employments.map((e, i) => (
              <div key={i} className="emp">
                <div className="emp-top">
                  <span>{e.title ?? "—"}</span>
                  <span style={{ color: "var(--mute)", fontWeight: 500 }}>
                    {fmtMonth(e.startDate)} – {e.endDate ? fmtMonth(e.endDate) : "Present"}
                  </span>
                </div>
                <div className="emp-sub">
                  {e.company}
                  {!e.fullTime ? " · part-time" : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div>
          <div className="sect-label">
            <Icon name="clock" size={14} /> Timeline
          </div>
          <div className="timeline-row">
            <span className="tl-k">Created</span>
            <span>{fmtDate(c.createdAt)}</span>
          </div>
          <div className="timeline-row">
            <span className="tl-k">Updated</span>
            <span>{relative(c.updatedAt)}</span>
          </div>
          {c.lastContactedAt && (
            <div className="timeline-row">
              <span className="tl-k">Last contact</span>
              <span>{relative(c.lastContactedAt)}</span>
            </div>
          )}
          <div className="timeline-row">
            <span className="tl-k">Source</span>
            <span>{c.source ?? "—"}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function recColor(rec: string): string {
  if (rec === "strong") return "var(--good)";
  if (rec === "weak") return "var(--bad)";
  return "var(--warn)";
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short" });
}
function relative(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}
