"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/primitives";

interface SelfView {
  candidate: { name: string; availability: string; availabilityNote: string | null; availabilityConfirmedAt: string | null };
  job: { title: string } | null;
  interview: {
    id: string;
    status: string;
    scheduledFor: string | null;
    timezone: string | null;
    proposedSlots: string[];
    meetingUrl: string | null;
    candidateStatus: string;
  } | null;
  error?: string;
}

// Candidate micro-surface (Mission 8 Phase 3): confirm/decline availability and
// respond to an interview invite, with no login. Token-authorized.
export function CandidatePortalView({ token }: { token: string }) {
  const [data, setData] = useState<SelfView | null>(null);
  const [status, setStatus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reschedule, setReschedule] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/candidate/${token}`);
    setStatus(res.status);
    setData(await res.json());
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function act(action: string, msg?: string) {
    setBusy(true);
    const res = await fetch(`/api/candidate/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, message: msg }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(action);
      setReschedule(false);
      setMessage("");
      load();
    }
  }

  if (status !== 0 && status >= 400) {
    return (
      <Shell>
        <div className="banner banner-bad">
          This link is {status === 410 ? "no longer active" : "not valid"}. Please ask your recruiter for a new one.
        </div>
      </Shell>
    );
  }
  if (!data || !data.candidate) {
    return <Shell><div className="loading">Loading…</div></Shell>;
  }

  const iv = data.interview;
  const availableConfirmed = Boolean(data.candidate.availabilityConfirmedAt) && data.candidate.availability === "available";

  return (
    <Shell>
      <div className="share-hello">Hi {data.candidate.name.split(" ")[0]} 👋</div>
      <div className="share-sub">
        {data.job ? <>You&apos;re being considered for <b>{data.job.title}</b>. </> : null}
        Help us move fast — confirm your availability{iv ? " and your interview time" : ""} below.
      </div>

      {done && <div className="banner banner-good" style={{ marginBottom: 14 }}>✓ Thanks — your recruiter has been updated.</div>}

      {/* Availability */}
      <div className="share-card">
        <div className="sect-label"><Icon name="users" size={13} /> Your availability</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 12px" }}>
          <Pill tone={availableConfirmed ? "good" : data.candidate.availability === "on_hold" ? "warn" : "default"}>
            {availableConfirmed ? "Available (confirmed)" : data.candidate.availability === "on_hold" ? "On hold" : "Not confirmed"}
          </Pill>
          {data.candidate.availabilityConfirmedAt && (
            <span style={{ fontSize: 12, color: "var(--mute)" }}>updated {new Date(data.candidate.availabilityConfirmedAt).toLocaleDateString()}</span>
          )}
        </div>
        <div className="share-actions">
          <button className="btn btn-good" disabled={busy} onClick={() => act("confirm_availability")}>
            <Icon name="check" size={15} /> I&apos;m available
          </button>
          <button className="btn btn-bad" disabled={busy} onClick={() => act("decline_availability")}>
            <Icon name="x" size={15} /> Not right now
          </button>
        </div>
      </div>

      {/* Interview */}
      {iv && (
        <div className="share-card">
          <div className="sect-label"><Icon name="calendar" size={13} /> Your interview</div>
          {iv.scheduledFor ? (
            <div style={{ fontSize: 14, margin: "6px 0" }}>
              {new Date(iv.scheduledFor).toLocaleString()} {iv.timezone ? `(${iv.timezone})` : ""}
              {iv.candidateStatus === "confirmed" && <> · <Pill tone="good">Confirmed</Pill></>}
              {iv.candidateStatus === "reschedule_requested" && <> · <Pill tone="warn">Reschedule requested</Pill></>}
            </div>
          ) : iv.proposedSlots.length > 0 ? (
            <div style={{ margin: "6px 0" }}>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>Your recruiter proposed these times — your preference helps:</div>
              <div className="tag-row tag-row-sm">
                {iv.proposedSlots.map((s) => (
                  <span key={s} className="tag tag-sm">{new Date(s).toLocaleString()}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--mute)", margin: "6px 0" }}>A time will be proposed shortly.</div>
          )}

          {iv.meetingUrl && (
            <div style={{ fontSize: 12.5, marginBottom: 8 }}>
              Join link: <a href={iv.meetingUrl} target="_blank" rel="noreferrer">{iv.meetingUrl}</a>
            </div>
          )}

          {!reschedule ? (
            <div className="share-actions">
              <button className="btn btn-good" disabled={busy || !iv.scheduledFor} onClick={() => act("confirm_interview")}>
                <Icon name="check" size={15} /> Confirm this time
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setReschedule(true)}>
                <Icon name="calendar" size={15} /> Request another time
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea className="mc-in" style={{ minHeight: 60, resize: "vertical" }} placeholder="Let us know what times work better for you…" value={message} onChange={(e) => setMessage(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" disabled={busy || !message.trim()} onClick={() => act("request_reschedule", message.trim())}>Send</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setReschedule(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="share-foot">Powered by ANVI · This is a private link just for you.</div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="share-page">
      <div className="share-top">
        <div className="brand-mark">A</div>
        <div className="brand-name">ANVI</div>
      </div>
      <div className="share-wrap">{children}</div>
    </div>
  );
}
