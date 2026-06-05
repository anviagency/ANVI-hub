"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Pill, initialsOf, AVAILABILITY_LABEL } from "@/components/primitives";
import { api, JobListItem, TalentItem, ClientListItem } from "@/lib/client/api";
import { AddCandidate } from "@/components/AddCandidate";

export function VacanciesView({ onMatch }: { onMatch: (prompt: string) => void }) {
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  useEffect(() => {
    api.jobs().then((d) => setJobs(d.jobs)).catch(() => setJobs([]));
  }, []);
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">Vacancies</div>
          <div className="view-sub">Open roles parsed from chat, with live pipeline counts.</div>
        </div>
      </div>
      {!jobs ? (
        <div className="loading">Loading roles…</div>
      ) : jobs.length === 0 ? (
        <div className="empty">No roles yet. Paste one into Ask ANVI.</div>
      ) : (
        <div className="card-grid">
          {jobs.map((j) => (
            <button key={j.id} className="vcard" onClick={() => onMatch(`Match candidates for ${j.title}`)}>
              <div className="vcard-top">
                <div>
                  <div className="vcard-title">{j.title}</div>
                  <div className="vcard-meta">
                    {[j.client?.company, j.seniority, budget(j)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Pill tone={j.status === "open" ? "good" : "default"}>{j.status}</Pill>
              </div>
              <div className="tag-row tag-row-sm">
                {j.skills.slice(0, 6).map((s) => (
                  <span key={s.name} className={"tag tag-sm" + (s.required ? "" : " tag-adv")}>
                    {s.name}
                  </span>
                ))}
              </div>
              <div className="vcard-stats">
                <div className="vstat">
                  <b>{j.analyzed}</b>
                  <span>Analyzed</span>
                </div>
                <div className="vstat">
                  <b>{j.submitted}</b>
                  <span>Submitted</span>
                </div>
                <div className="vstat">
                  <b>{j.experienceYearsMin ?? "—"}</b>
                  <span>Min yrs</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CandidatesView({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<TalentItem[] | null>(null);
  const [filter, setFilter] = useState<"all" | "available">("all");
  const [adding, setAdding] = useState(false);
  const load = () => api.candidates().then((d) => setItems(d.candidates)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  const shown = (items ?? []).filter((c) => (filter === "available" ? c.availability === "available" : true));
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">Talent pool</div>
          <div className="view-sub">{items ? `${items.length} candidates` : "…"} · click to open the data room.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={15} /> Add candidate
        </button>
      </div>
      {adding && <AddCandidate onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); load(); onOpen(id); }} />}
      <div className="view-filters">
        <button className="chip" data-active={filter === "all" ? "" : undefined} onClick={() => setFilter("all")}>
          All
        </button>
        <button
          className="chip"
          data-active={filter === "available" ? "" : undefined}
          onClick={() => setFilter("available")}
        >
          Available
        </button>
      </div>
      {!items ? (
        <div className="loading">Loading talent…</div>
      ) : (
        <div className="cres-list">
          {shown.map((c) => (
            <button key={c.id} className="cres" onClick={() => onOpen(c.id)}>
              <Avatar initials={initialsOf(c.name)} flag={c.flag} size={40} />
              <div className="cres-main">
                <div className="cres-name">{c.name}{c.source && <span className="cres-tag">{c.source}</span>}</div>
                <div className="cres-sub">
                  {[c.title, c.location && c.country ? `${c.location}, ${c.country}` : c.country, c.english]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="tag-row tag-row-sm">
                  {c.skills.slice(0, 5).map((s) => (
                    <span key={s} className="tag tag-sm">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="cres-right">
                <div className="cres-rate">{c.clientRate != null ? <>${c.clientRate}<span>/hr</span></> : "—"}</div>
                <div className="cres-avail">{AVAILABILITY_LABEL[c.availability] ?? c.availability}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClientsView() {
  const [clients, setClients] = useState<ClientListItem[] | null>(null);
  useEffect(() => {
    api.clients().then((d) => setClients(d.clients)).catch(() => setClients([]));
  }, []);
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">Clients</div>
          <div className="view-sub">Each client has a shared portal slug for their data room.</div>
        </div>
      </div>
      {!clients ? (
        <div className="loading">Loading clients…</div>
      ) : (
        <div className="card-grid">
          {clients.map((c) => (
            <div key={c.id} className="vcard" style={{ cursor: "default" }}>
              <div className="vcard-top">
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Avatar initials={c.initials || initialsOf(c.name)} size={42} accent />
                  <div>
                    <div className="vcard-title">{c.company ?? c.name}</div>
                    <div className="vcard-meta">
                      {c.name}
                      {c.country ? ` · ${c.country}` : ""}
                    </div>
                  </div>
                </div>
              </div>
              <div className="vcard-meta" style={{ marginTop: 4, fontFamily: "var(--mono)", fontSize: 11.5 }}>
                <Icon name="share" size={12} /> /portal/{c.portalSlug}
              </div>
              <div className="vcard-stats">
                <div className="vstat">
                  <b>{c.jobs}</b>
                  <span>Open roles</span>
                </div>
                <div className="vstat">
                  <b>{c.placements}</b>
                  <span>Placements</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function budget(j: JobListItem): string {
  if (j.budgetMin == null) return "";
  const suffix = "/hr";
  if (j.budgetMin === j.budgetMax) return `$${j.budgetMin}${suffix}`;
  return `$${j.budgetMin}–${j.budgetMax}${suffix}`;
}
