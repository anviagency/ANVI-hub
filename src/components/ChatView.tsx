"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, MatchRing, Pill } from "@/components/primitives";
import { api, CandidateCard, ChatResponse } from "@/lib/client/api";
import type { ParsedJob } from "@/lib/types";

const STARTERS = [
  { icon: "briefcase", label: "Need a Senior Full-Stack dev: React, Next.js, Node, Postgres, 5+ yrs, $28-42/hr" },
  { icon: "users", label: "Match candidates for the Full-Stack role" },
  { icon: "shield", label: "Find me people but flag any anomalies" },
  { icon: "search", label: "Find candidates like Artem but cheaper" },
];

type Msg =
  | { role: "user"; id: number; text: string }
  | { role: "ai"; id: number; resp: ChatResponse; instant?: boolean };

let MID = 1;
const nextId = () => MID++;

// -------- typewriter --------
function useTypewriter(text: string, speed = 9, start = true) {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!start) return;
    setOut("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setOut(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setOut(text);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, start]);
  return [out, done] as const;
}

function ThinkingTrace({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= lines.length) {
      const t = setTimeout(onDone, 260);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep(step + 1), 380);
    return () => clearTimeout(t);
  }, [step, lines.length, onDone]);
  if (lines.length === 0) return null;
  return (
    <div className="trace">
      {lines.slice(0, step).map((l, i) => (
        <div key={i} className="trace-line" data-last={i === step - 1 && step < lines.length ? "" : undefined}>
          <span className="trace-dot" /> {l}
        </div>
      ))}
    </div>
  );
}

// -------- response bodies --------
function JobPreviewCard({
  parsed,
  aiBacked,
  rawText,
  onSaved,
}: {
  parsed: ParsedJob;
  aiBacked: boolean;
  rawText: string;
  onSaved: (jobId: string, title: string) => void;
}) {
  const [clientInput, setClientInput] = useState("");
  const [stage, setStage] = useState<"ask" | "confirm" | "saving" | "saved">("ask");
  const [resolved, setResolved] = useState<{ id?: string; name: string; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const budgetStr =
    parsed.budget.min != null
      ? parsed.budget.min === parsed.budget.max
        ? `$${parsed.budget.min}${unitSuffix(parsed.budget.unit)}`
        : `$${parsed.budget.min}–${parsed.budget.max}${unitSuffix(parsed.budget.unit)}`
      : "—";

  async function resolveClient() {
    const name = clientInput.trim();
    if (!name) return;
    setError(null);
    try {
      const r = await api.resolveClient(name);
      if (r.found && r.client) {
        setResolved({ id: r.client.id, name: r.client.company || r.client.name, isNew: false });
      } else {
        setResolved({ name, isNew: true });
      }
      setStage("confirm");
    } catch {
      setError("Could not reach the server.");
    }
  }

  async function save() {
    if (!resolved) return;
    setStage("saving");
    setError(null);
    try {
      let clientId = resolved.id;
      if (resolved.isNew) {
        const c = await api.createClient(resolved.name);
        clientId = c.client.id;
      }
      const res = await api.createJob({
        clientId,
        title: parsed.title ?? "Untitled role",
        seniority: parsed.seniority,
        experienceYearsMin: parsed.experienceYearsMin,
        englishLevel: parsed.englishLevel,
        budget: parsed.budget,
        skills: parsed.skills,
        descriptionRaw: rawText,
      });
      setStage("saved");
      onSaved(res.job.id, res.job.title);
    } catch {
      setError("Could not save the role.");
      setStage("confirm");
    }
  }

  return (
    <div className="rcard">
      <div className="rcard-head">
        <div>
          <div className="rcard-eyebrow">New vacancy · draft</div>
          <div className="rcard-title">{parsed.title ?? "Untitled role"}</div>
        </div>
        <Pill tone="accent">{parsed.seniority ?? "—"}</Pill>
      </div>
      <div className="kv-grid">
        <div className="kv">
          <span>Experience</span>
          <b>{parsed.experienceYearsMin != null ? `${parsed.experienceYearsMin}+ years` : "—"}</b>
        </div>
        <div className="kv">
          <span>Budget</span>
          <b>{budgetStr}</b>
        </div>
        <div className="kv">
          <span>English</span>
          <b>{parsed.englishLevel ?? "—"}</b>
        </div>
        <div className="kv">
          <span>Client</span>
          <b>{stage === "saved" || resolved ? resolved?.name : "❓ Unknown"}</b>
        </div>
      </div>
      <div className="tag-row">
        {parsed.skills.map((s) => (
          <span key={s.name} className={"tag" + (s.required ? "" : " tag-adv")}>
            {s.name}
            {s.minYears ? ` ${s.minYears}y` : ""}
            {s.required ? "" : " ·adv"}
          </span>
        ))}
      </div>

      {!aiBacked && (
        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--faint)" }}>
          Parsed by the built-in deterministic engine (no Anthropic key set).
        </div>
      )}

      {stage === "ask" && (
        <>
          <div style={{ marginTop: 14, fontSize: 14, fontWeight: 600 }}>Who is the client?</div>
          <div className="resolve">
            <input
              autoFocus
              value={clientInput}
              placeholder="e.g. Andy"
              onChange={(e) => setClientInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && resolveClient()}
            />
            <button className="btn btn-primary" onClick={resolveClient} disabled={!clientInput.trim()}>
              Continue
            </button>
          </div>
        </>
      )}

      {stage === "confirm" && resolved && (
        <div className="rcard-actions" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>
            {resolved.isNew ? (
              <>
                No client named <b>{resolved.name}</b> yet. Create it and attach?
              </>
            ) : (
              <>
                Existing client <b>{resolved.name}</b> found. Attach this role?
              </>
            )}
          </span>
          <button className="btn btn-primary" onClick={save}>
            <Icon name="check" size={15} /> {resolved.isNew ? "Create & attach" : "Yes, attach"}
          </button>
          <button className="btn btn-ghost" onClick={() => setStage("ask")}>
            Change
          </button>
        </div>
      )}

      {stage === "saving" && <div style={{ marginTop: 14, color: "var(--mute)" }}>Saving…</div>}

      {stage === "saved" && (
        <div className="banner banner-info" style={{ marginTop: 14 }}>
          <Icon name="check" size={14} /> Saved & attached to {resolved?.name}. Type “match” to find candidates.
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, color: "var(--bad)", fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}

function CandidateRow({ c, onOpen }: { c: CandidateCard; onOpen: () => void }) {
  const flagged = c.anomalies.length > 0;
  return (
    <button className="cres" data-flagged={flagged ? "" : undefined} onClick={onOpen}>
      <MatchRing score={c.matchScore} size={44} />
      <Avatar initials={initials(c.name)} flag={c.flag} size={40} />
      <div className="cres-main">
        <div className="cres-name">
          {c.name}
          {flagged ? (
            <span className="cres-tag cres-tag-bad">🔴 {c.anomalies.length} anomaly</span>
          ) : c.recommendation === "strong" ? (
            <span className="cres-tag">Strong match</span>
          ) : null}
        </div>
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
        <div className="cres-rate">
          {c.clientRate != null ? <>${c.clientRate}<span>/hr</span></> : "—"}
        </div>
        <div className="cres-avail" style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
          {c.freshness && <span className={"sdot sdot-" + freshnessDot(c.freshness.band)} title={`${c.freshness.label} · updated ${c.freshness.daysSinceUpdated}d ago`} />}
          {c.availabilityNote ?? c.availability}
        </div>
      </div>
    </button>
  );
}

function ResponseBody({
  resp,
  onSaved,
  rawText,
  onOpenCandidate,
}: {
  resp: ChatResponse;
  rawText: string;
  onSaved: (jobId: string, title: string) => void;
  onOpenCandidate: (id: string, jobId?: string) => void;
}) {
  if (resp.kind === "job_preview" && resp.data.parsed) {
    return (
      <JobPreviewCard
        parsed={resp.data.parsed}
        aiBacked={Boolean(resp.data.aiBacked)}
        rawText={rawText}
        onSaved={onSaved}
      />
    );
  }
  if (resp.kind === "candidates" && resp.data.list) {
    return (
      <div className="cres-list">
        {resp.data.list.length === 0 && (
          <div className="empty">No candidates cleared the filter. Try widening the role.</div>
        )}
        {resp.data.list.map((c) => (
          <CandidateRow key={c.id} c={c} onOpen={() => onOpenCandidate(c.id, resp.data.jobId)} />
        ))}
      </div>
    );
  }
  if (resp.kind === "status" && resp.data.jobs) {
    return (
      <div className="rcard" style={{ padding: 0, overflow: "hidden" }}>
        <table className="status-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Client</th>
              <th>Analyzed</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {resp.data.jobs.map((j) => (
              <tr key={j.id}>
                <td style={{ fontWeight: 600 }}>{j.title}</td>
                <td>{j.client}</td>
                <td>{j.analyzed}</td>
                <td>{j.submitted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

function AssistantMessage({
  msg,
  rawText,
  onSaved,
  onOpenCandidate,
}: {
  msg: Extract<Msg, { role: "ai" }>;
  rawText: string;
  onSaved: (jobId: string, title: string) => void;
  onOpenCandidate: (id: string, jobId?: string) => void;
}) {
  const hasThinking = (msg.resp.thinking?.length ?? 0) > 0 && !msg.instant;
  const [phase, setPhase] = useState<"thinking" | "typing" | "ready">(hasThinking ? "thinking" : "typing");
  const [typed, done] = useTypewriter(msg.resp.reply, 8, phase === "typing");
  useEffect(() => {
    if (phase === "typing" && done) setPhase("ready");
  }, [done, phase]);

  return (
    <div className="msg msg-ai">
      <div className="ai-badge">
        <Icon name="spark" size={15} />
      </div>
      <div className="msg-body">
        {phase === "thinking" && <ThinkingTrace lines={msg.resp.thinking} onDone={() => setPhase("typing")} />}
        {phase !== "thinking" && (
          <>
            <p className="ai-intro">
              {phase === "ready" ? msg.resp.reply : typed}
              <span className="caret" data-on={phase === "typing" ? "" : undefined} />
            </p>
            {phase === "ready" && (
              <div className="ai-reveal">
                <ResponseBody resp={msg.resp} rawText={rawText} onSaved={onSaved} onOpenCandidate={onOpenCandidate} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InputBar({ big, onSubmit }: { big?: boolean; onSubmit: (t: string) => void }) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!val.trim()) return;
    onSubmit(val.trim());
    setVal("");
    if (ref.current) ref.current.style.height = "auto";
  };
  return (
    <div className={"inputbar" + (big ? " inputbar-big" : "")}>
      <textarea
        ref={ref}
        className="inputbar-ta"
        rows={1}
        value={val}
        placeholder={big ? "Paste a role, or ask me to match candidates…" : "Message ANVI…"}
        onChange={(e) => {
          setVal(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="inputbar-row">
        <button className="ib-icon" title="Attach (coming soon)">
          <Icon name="plus" size={18} />
        </button>
        <div className="ib-spacer" />
        <button className="ib-send" onClick={submit} data-active={val.trim() ? "" : undefined}>
          <Icon name="arrowUp" size={18} stroke={2} />
        </button>
      </div>
    </div>
  );
}

export function ChatView({
  seedPrompt,
  onOpenCandidate,
}: {
  seedPrompt?: string | null;
  onOpenCandidate: (id: string, jobId?: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const currentJobId = useRef<string | null>(null);
  const lastUserText = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (busy) return;
    lastUserText.current = text;
    setMsgs((m) => [...m, { role: "user", id: nextId(), text }]);
    setBusy(true);
    try {
      const resp = await api.chat(text, currentJobId.current ? { jobId: currentJobId.current } : undefined);
      if (resp.data.jobId) currentJobId.current = resp.data.jobId;
      setMsgs((m) => [...m, { role: "ai", id: nextId(), resp }]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          id: nextId(),
          instant: true,
          resp: { intent: "error", thinking: [], reply: "Something went wrong reaching the server.", kind: "fallback", data: {} },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (seedPrompt) send(seedPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  const onSaved = (jobId: string) => {
    currentJobId.current = jobId;
  };

  if (msgs.length === 0) {
    return (
      <div className="chat-hero">
        <div className="hero-mark">
          <div className="brand-mark">A</div>
        </div>
        <h1 className="hero-title">
          What are we hiring today, <span>Daria</span>?
        </h1>
        <p className="hero-sub">Paste a role, match the talent pool, and catch anomalies — all from here.</p>
        <div className="hero-input">
          <InputBar big onSubmit={send} />
        </div>
        <div className="hero-starters">
          {STARTERS.map((s) => (
            <button key={s.label} className="starter" onClick={() => send(s.label)}>
              <span className="starter-ic">
                <Icon name={s.icon} size={16} />
              </span>
              <span>{s.label}</span>
              <Icon name="chevronR" size={15} className="starter-go" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-wrap">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-thread">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id} className="msg msg-user">
                <div className="user-bubble">{m.text}</div>
              </div>
            ) : (
              <AssistantMessage
                key={m.id}
                msg={m}
                rawText={i > 0 && msgs[i - 1].role === "user" ? (msgs[i - 1] as { text: string }).text : lastUserText.current}
                onSaved={onSaved}
                onOpenCandidate={onOpenCandidate}
              />
            )
          )}
        </div>
      </div>
      <div className="chat-foot">
        <InputBar onSubmit={send} />
        <div className="foot-hint">ANVI can make mistakes. Verify candidate details before sharing with clients.</div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function unitSuffix(unit: string | null): string {
  if (unit === "usd_hour") return "/hr";
  if (unit === "usd_month") return "/mo";
  return "";
}

function freshnessDot(band: string): string {
  if (band === "green") return "good";
  if (band === "yellow" || band === "amber") return "warn";
  if (band === "red") return "bad";
  return "default";
}
