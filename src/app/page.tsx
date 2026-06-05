"use client";

import React, { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/primitives";
import { ChatView } from "@/components/ChatView";
import { CandidateDrawer } from "@/components/CandidateDrawer";
import { CandidateProfile } from "@/components/CandidateProfile";
import { PipelineView } from "@/components/PipelineView";
import { ImportView } from "@/components/ImportView";
import { ActivityView } from "@/components/ActivityView";
import { JobWorkspace } from "@/components/JobWorkspace";
import { PlacementsView } from "@/components/PlacementsView";
import { VacanciesView, CandidatesView, ClientsView } from "@/components/views";

const NAV = [
  { key: "chat", icon: "spark", label: "Ask ANVI" },
  { key: "pipeline", icon: "grid", label: "Pipeline" },
  { key: "vacancies", icon: "briefcase", label: "Vacancies" },
  { key: "candidates", icon: "users", label: "Talent pool" },
  { key: "import", icon: "download", label: "Import" },
  { key: "activity", icon: "message", label: "Activity" },
  { key: "clients", icon: "building", label: "Clients" },
  { key: "placements", icon: "users", label: "Workforce" },
] as const;

type Route = (typeof NAV)[number]["key"] | "profile" | "workspace";

export default function Page() {
  const [route, setRoute] = useState<Route>("chat");
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [drawer, setDrawer] = useState<{ id: string; jobId?: string } | null>(null);
  const [profile, setProfile] = useState<{ id: string; jobId?: string } | null>(null);
  const [workspaceJob, setWorkspaceJob] = useState<string | null>(null);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [recentJobs, setRecentJobs] = useState<{ id: string; title: string; client?: string | null }[]>([]);

  const loadRecent = () => {
    fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRecentJobs((d.jobs ?? []).slice(0, 6).map((j: { id: string; title: string; client?: { company?: string | null } | null }) => ({ id: j.id, title: j.title, client: j.client?.company ?? null }))))
      .catch(() => setRecentJobs([]));
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setMe(d.user);
        setAuthChecked(true);
        loadRecent();
      })
      .catch(() => {
        location.href = "/login?next=/";
      });
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: { "x-anvi": "1" } });
    location.href = "/login";
  };

  const newChat = () => {
    setSeedPrompt(null);
    setChatKey((k) => k + 1);
    setRoute("chat");
  };

  const runPrompt = (prompt: string) => {
    setSeedPrompt(prompt);
    setChatKey((k) => k + 1);
    setRoute("chat");
  };

  const openProfile = (id: string, jobId?: string) => {
    setProfile({ id, jobId });
    setRoute("profile");
  };

  const openWorkspace = (jobId: string) => {
    setWorkspaceJob(jobId);
    setRoute("workspace");
    loadRecent();
  };

  const sideRoute: string = route === "profile" ? "candidates" : route === "workspace" ? "vacancies" : route;

  if (!authChecked) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--mute)" }}>Loading…</div>;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div className="brand-name">ANVI</div>
        </div>
        <button className="new-btn" onClick={newChat}>
          <Icon name="plus" size={17} /> New chat
        </button>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className="nav-item"
              data-active={sideRoute === n.key ? "" : undefined}
              onClick={() => setRoute(n.key)}
            >
              <Icon name={n.icon} size={18} /> <span>{n.label}</span>
            </button>
          ))}
        </nav>
        {recentJobs.length > 0 && (
          <div className="recent">
            <div className="recent-label">Recent roles</div>
            {recentJobs.map((j) => (
              <button key={j.id} className="recent-item" onClick={() => openWorkspace(j.id)} title={j.client ? `${j.title} · ${j.client}` : j.title}>
                {j.client ? `${j.title} · ${j.client}` : j.title}
              </button>
            ))}
          </div>
        )}
        <div className="user">
          <Avatar initials={(me?.name ?? "DL").split(/\s+/).map((w) => w[0]?.toUpperCase()).join("").slice(0, 2)} size={32} accent />
          <div className="user-id">
            <div className="user-name">{me?.name ?? "Recruiter"}</div>
            <div className="user-role" style={{ textTransform: "capitalize" }}>{me?.role ?? ""}</div>
          </div>
          <button className="user-set" onClick={logout} title="Sign out" style={{ background: "none" }}>
            <Icon name="x" size={16} />
          </button>
        </div>
      </aside>

      <main className="main">
        {route === "chat" && (
          <ChatView key={chatKey} seedPrompt={seedPrompt} onOpenCandidate={(id, jobId) => setDrawer({ id, jobId })} onOpenWorkspace={openWorkspace} />
        )}
        {route === "pipeline" && <PipelineView onOpen={openProfile} />}
        {route === "vacancies" && <VacanciesView onMatch={runPrompt} onOpenWorkspace={openWorkspace} />}
        {route === "candidates" && <CandidatesView onOpen={(id) => openProfile(id)} />}
        {route === "import" && <ImportView />}
        {route === "activity" && <ActivityView />}
        {route === "clients" && <ClientsView />}
        {route === "placements" && <PlacementsView />}
        {route === "profile" && profile && (
          <CandidateProfile candidateId={profile.id} jobId={profile.jobId} onBack={() => setRoute("candidates")} />
        )}
        {route === "workspace" && workspaceJob && (
          <JobWorkspace jobId={workspaceJob} onBack={() => setRoute("vacancies")} onOpenCandidate={openProfile} />
        )}
      </main>

      {drawer && <CandidateDrawer candidateId={drawer.id} jobId={drawer.jobId} onClose={() => setDrawer(null)} />}
    </div>
  );
}
