"use client";

import React, { useEffect, useState } from "react";
import { Avatar, Pill, initialsOf, Tone } from "@/components/primitives";
import { api, PlacementItem } from "@/lib/client/api";

const STATUS_TONE: Record<string, Tone> = { active: "good", paused: "warn", ended: "default" };
const ONBOARDING_TONE: Record<string, Tone> = { pending: "warn", in_progress: "accent", complete: "good" };
const ONBOARDING_LABEL: Record<string, string> = { pending: "Onboarding pending", in_progress: "Onboarding in progress", complete: "Onboarded" };

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function PlacementsView() {
  const [items, setItems] = useState<PlacementItem[] | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.placements().then((d) => setItems(d.placements)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);

  const shown = (items ?? []).filter((p) => (filter === "active" ? p.status === "active" : true));

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">Workforce</div>
          <div className="view-sub">
            {items ? `${items.filter((p) => p.status === "active").length} active placements` : "…"} · accepted offers become placed workers here.
          </div>
        </div>
      </div>
      <div className="view-filters">
        <button className="chip" data-active={filter === "active" ? "" : undefined} onClick={() => setFilter("active")}>
          Active
        </button>
        <button className="chip" data-active={filter === "all" ? "" : undefined} onClick={() => setFilter("all")}>
          All
        </button>
      </div>
      {!items ? (
        <div className="loading">Loading placements…</div>
      ) : shown.length === 0 ? (
        <div className="empty">No placements yet. They appear once an offer is accepted.</div>
      ) : (
        <div className="cres-list">
          {shown.map((p) => {
            const name = p.candidate?.name ?? "Candidate";
            const isEditing = editing === p.id;
            return (
              <div key={p.id} className="cres" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", width: "100%" }}>
                  <Avatar initials={initialsOf(name)} flag={p.candidate?.flag ?? null} size={40} />
                  <div className="cres-main">
                    <div className="cres-name">
                      {name}
                      <Pill tone={STATUS_TONE[p.status] ?? "default"}>{p.status}</Pill>
                    </div>
                    <div className="cres-sub">
                      {[p.title ?? p.job?.title, p.client?.company ?? p.client?.name, p.candidate?.country].filter(Boolean).join(" · ")}
                    </div>
                    <div className="tag-row tag-row-sm" style={{ marginTop: 4 }}>
                      <Pill tone={ONBOARDING_TONE[p.onboardingStatus] ?? "default"}>{ONBOARDING_LABEL[p.onboardingStatus] ?? p.onboardingStatus}</Pill>
                      {p.startDate && <span className="tag tag-sm">Starts {new Date(p.startDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="cres-right">
                    <div className="cres-rate">{p.clientRate != null ? <>${p.clientRate}<span>/hr</span></> : "—"}</div>
                    <button className="btn" onClick={() => setEditing(isEditing ? null : p.id)} style={{ marginTop: 6 }}>
                      {isEditing ? "Close" : "Manage"}
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <PlacementEditor
                    placement={p}
                    saving={saving}
                    onSave={async (body) => {
                      setSaving(true);
                      try {
                        await api.updatePlacement(p.id, body);
                        await load();
                        setEditing(null);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlacementEditor({
  placement,
  saving,
  onSave,
}: {
  placement: PlacementItem;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(toDateInput(placement.startDate));
  const [onboardingStatus, setOnboardingStatus] = useState(placement.onboardingStatus);
  const [status, setStatus] = useState(placement.status);
  const [notes, setNotes] = useState(placement.notes ?? "");

  const submit = () => {
    const body: Record<string, unknown> = { onboardingStatus, status };
    if (startDate) body.startDate = new Date(startDate + "T09:00:00").toISOString();
    if (notes.trim()) body.notes = notes.trim();
    void onSave(body);
  };

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--mute)" }}>
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mc-in" />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--mute)" }}>
          Onboarding
          <select value={onboardingStatus} onChange={(e) => setOnboardingStatus(e.target.value as PlacementItem["onboardingStatus"])} className="mc-in">
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--mute)" }}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as PlacementItem["status"])} className="mc-in">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </select>
        </label>
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--mute)" }}>
        Notes
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. laptop shipped, NDA signed" className="mc-in" />
      </label>
      <div>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
