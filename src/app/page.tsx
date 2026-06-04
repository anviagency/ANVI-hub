"use client";

import React, { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/primitives";
import { ChatView } from "@/components/ChatView";
import { CandidateDrawer } from "@/components/CandidateDrawer";
import { CandidateProfile } from "@/components/CandidateProfile";
import { PipelineView } from "@/components/PipelineView";
import { ImportView } from "@/components/ImportView";
import { VacanciesView, CandidatesView, ClientsView } from "@/components/views";

const NAV = [
  { key: "chat", icon: "spark", label: "Ask ANVI" },
  { key: "pipeline", icon: "grid", label: "Pipeline" },
  { key: "vacancies", icon: "briefcase", label: "Vacancies" },
  { key: "candidates", icon: "users", label: "Talent pool" },
  { key: "import", icon: "download", label: "Import" },
  { key: "clients", icon: "building", label: "Clients" },
] as const;

type Route = (typeof NAV)[number]["key"] | "profile";

export default function Page() {
  const [route, setRoute] = useState<Route>("chat");
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [drawer, setDrawer] = useState<{ id: string; jobId?: string } | null>(null);
  const [profile, setProfile] = useState<{ id: string; jobId?: string } | null>(null);

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

  const sideRoute: string = route === "profile" ? "candidates" : route;

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
        <div className="recent">
          <div className="recent-label">Recent</div>
          {["Full-Stack for Andy", "ML Engineer · Vektor", "Cheaper React devs"].map((r) => (
            <button key={r} className="recent-item" onClick={() => setRoute("chat")}>
              {r}
            </button>
          ))}
        </div>
        <div className="user">
          <Avatar initials="DL" size={32} accent />
          <div className="user-id">
            <div className="user-name">Daria Levin</div>
            <div className="user-role">Senior Recruiter</div>
          </div>
          <Icon name="sliders" size={16} className="user-set" />
        </div>
      </aside>

      <main className="main">
        {route === "chat" && (
          <ChatView key={chatKey} seedPrompt={seedPrompt} onOpenCandidate={(id, jobId) => setDrawer({ id, jobId })} />
        )}
        {route === "pipeline" && <PipelineView onOpen={openProfile} />}
        {route === "vacancies" && <VacanciesView onMatch={runPrompt} />}
        {route === "candidates" && <CandidatesView onOpen={(id) => openProfile(id)} />}
        {route === "import" && <ImportView />}
        {route === "clients" && <ClientsView />}
        {route === "profile" && profile && (
          <CandidateProfile candidateId={profile.id} jobId={profile.jobId} onBack={() => setRoute("candidates")} />
        )}
      </main>

      {drawer && <CandidateDrawer candidateId={drawer.id} jobId={drawer.jobId} onClose={() => setDrawer(null)} />}
    </div>
  );
}
