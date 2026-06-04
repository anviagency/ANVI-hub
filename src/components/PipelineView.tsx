"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, initialsOf } from "@/components/primitives";
import { api, JobListItem, PipelineEntry } from "@/lib/client/api";

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  screened: "Screened",
  sent_to_client: "Sent to client",
  interview: "Interview",
  approved: "Approved",
  rejected: "Rejected",
  hired: "Hired",
};

export function PipelineView({ onOpen }: { onOpen: (id: string, jobId?: string) => void }) {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [filters, setFilters] = useState({ country: "", skill: "", availability: "", maxRate: "", q: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.jobs().then((d) => {
      setJobs(d.jobs);
      if (d.jobs[0]) setJobId(d.jobs[0].id);
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api
      .pipeline({ jobId, ...filters })
      .then((d) => {
        setEntries(d.entries);
        setStages(d.stages);
      })
      .finally(() => setLoading(false));
  }, [jobId, filters]);

  useEffect(() => {
    if (jobId) load();
  }, [jobId, load]);

  async function move(entry: PipelineEntry, stage: string) {
    const res = await api.movePipeline({ candidateId: entry.candidate.id, jobId: entry.job.id, stage });
    if (res.error) {
      alert(res.error); // invalid transition (409) etc.
      return;
    }
    load();
  }

  const byStage = (s: string) => entries.filter((e) => e.stage === s);

  return (
    <div className="view" style={{ maxWidth: "100%" }}>
      <div className="view-head">
        <div>
          <div className="view-title">Pipeline</div>
          <div className="view-sub">Move candidates through stages · filter by skills, country, rate, availability.</div>
        </div>
      </div>

      <div className="filters-bar">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <input placeholder="Search name…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <input placeholder="Skill" value={filters.skill} onChange={(e) => setFilters((f) => ({ ...f, skill: e.target.value }))} />
        <input placeholder="Country" value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))} />
        <input
          placeholder="Max $/hr"
          value={filters.maxRate}
          onChange={(e) => setFilters((f) => ({ ...f, maxRate: e.target.value.replace(/[^0-9]/g, "") }))}
          style={{ width: 90 }}
        />
        <select value={filters.availability} onChange={(e) => setFilters((f) => ({ ...f, availability: e.target.value }))}>
          <option value="">Any availability</option>
          <option value="available">Available</option>
          <option value="on_hold">On hold</option>
          <option value="placed">Placed</option>
        </select>
      </div>

      {loading && entries.length === 0 ? (
        <div className="loading">Loading pipeline…</div>
      ) : (
        <div className="board">
          {stages.map((s) => {
            const items = byStage(s);
            return (
              <div key={s} className="board-col">
                <div className="board-col-head">
                  <span>{STAGE_LABEL[s] ?? s}</span>
                  <span className="cnt">{items.length}</span>
                </div>
                {items.length === 0 && <div className="board-col-empty">—</div>}
                {items.map((e) => (
                  <div key={e.id} className="pcard" onClick={() => onOpen(e.candidate.id, e.job.id)}>
                    <div className="pcard-name">
                      <Avatar initials={initialsOf(e.candidate.name)} flag={e.candidate.flag} size={22} />
                      {e.candidate.name}
                    </div>
                    <div className="pcard-sub">
                      {[e.candidate.title, e.candidate.country].filter(Boolean).join(" · ")}
                    </div>
                    <div className="tag-row tag-row-sm">
                      {e.candidate.skills.slice(0, 3).map((sk) => (
                        <span key={sk} className="tag tag-sm">
                          {sk}
                        </span>
                      ))}
                    </div>
                    <div className="pcard-foot" onClick={(ev) => ev.stopPropagation()}>
                      <span className="pcard-rate">{e.candidate.clientRate != null ? `$${e.candidate.clientRate}/hr` : "—"}</span>
                      <select value={s} onChange={(ev) => move(e, ev.target.value)} title="Move to stage">
                        {stages.map((st) => (
                          <option key={st} value={st}>
                            {STAGE_LABEL[st] ?? st}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
