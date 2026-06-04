// ANVI — AI chat command surface
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

// ---- Command interpreter: maps free text -> structured response ----
function interpret(text, ctx) {
  const t = text.toLowerCase();
  const { VACANCIES, CANDIDATES, CLIENTS } = window.ANVI;
  const findVac = () => {
    if (t.match(/ml|llm|rag|machine learning/)) return VACANCIES.find(v => v.id === "v-ml");
    if (t.match(/design|designer|ux|ui/)) return VACANCIES.find(v => v.id === "v-design");
    return VACANCIES.find(v => v.id === "v-fullstack");
  };

  // CREATE A VACANCY
  if (t.match(/\b(open|create|new|post|need|looking for|hire|hiring|חפש|פתח|צריך)\b/) &&
      t.match(/\b(role|job|vacancy|position|developer|engineer|designer|dev|stack|מפתח|משרה)\b/)) {
    const isML = t.match(/ml|llm|rag/);
    const isDesign = t.match(/design/);
    const draft = isML ? {
      title: "ML Engineer (LLM / RAG)", clientId: "lena", seniority: "Senior",
      stack: ["Python", "PyTorch", "RAG", "LangChain", "pgvector"], budget: "$45–65 / hr",
    } : isDesign ? {
      title: "Product Designer (B2B)", clientId: "marco", seniority: "Middle+",
      stack: ["Figma", "Design Systems", "B2B", "Prototyping"], budget: "$30–45 / hr",
    } : {
      title: "Senior Full-Stack Developer", clientId: "andy", seniority: "Senior",
      stack: ["React", "Next.js", "Node.js", "Express", "PostgreSQL", "SaaS"], budget: "$28–42 / hr",
    };
    return {
      thinking: ["Parsing role from your message…", "Drafting structured vacancy…", "Generating screening questions…"],
      intro: "I drafted this vacancy from your brief. Review it, then post to Telegram and I'll start matching against the database.",
      kind: "vacancy", data: draft,
    };
  }

  // FIND / MATCH CANDIDATES
  if (t.match(/\b(find|match|search|show|who|best|top|candidates?|מצא|מי)\b/)) {
    const vac = findVac();
    const ranked = CANDIDATES
      .map(c => ({ c, m: c.match[vac.id] || 0 }))
      .filter(x => x.m >= 40)
      .sort((a, b) => b.m - a.m).slice(0, 5);
    const budgetCap = t.match(/under|below|less|cheaper|max|תקציב/) ? true : false;
    let list = ranked;
    if (budgetCap) list = ranked.filter(x => x.c.clientRate <= 36);
    return {
      thinking: ["Reading vacancy requirements…", `Scanning 248 candidates · structured + semantic…`, "Scoring fit & ranking…"],
      intro: `Here are the ${list.length} strongest matches for ${vac.title}${budgetCap ? ", filtered to your budget" : ""}. Ranked by skills, seniority, AI-tooling and rate.`,
      kind: "candidates", data: { vac, list },
    };
  }

  // TELEGRAM UPDATE
  if (t.match(/telegram|טלגרם|update|עדכן/)) {
    const vac = VACANCIES.find(v => v.id === "v-fullstack");
    return {
      thinking: ["Reading current pipeline…", "Composing channel update…"],
      intro: "Draft update for the Telegram thread. Approve to post it under the vacancy.",
      kind: "telegram", data: { vac },
    };
  }

  // SCREENING QUESTIONS
  if (t.match(/screening|questions|שאלות/)) {
    return {
      thinking: ["Analysing role requirements…", "Writing 5 screening questions…"],
      intro: "Five screening questions tailored to the Full-Stack role:",
      kind: "screening", data: {},
    };
  }

  // CLIENT SUMMARY / SHORTLIST
  if (t.match(/client|shortlist|summary|send|לקוח/)) {
    return {
      thinking: ["Selecting client-ready candidates…", "Writing executive summary…"],
      intro: "Client-ready summary of your top 3 candidates. You can open the Shortlist builder to share a live link.",
      kind: "client", data: {},
    };
  }

  // FALLBACK
  return {
    thinking: ["Thinking…"],
    intro: "I can open vacancies, search the candidate database, draft Telegram updates, generate screening questions, and build client shortlists. Try one of these:",
    kind: "fallback", data: {},
  };
}

const STARTERS = [
  { icon: "briefcase", label: "Open a Senior Full-Stack role for Andy" },
  { icon: "users", label: "Find the best candidates for the Full-Stack role" },
  { icon: "telegram", label: "Draft a Telegram update for the pipeline" },
  { icon: "share", label: "Build a client shortlist to share" },
];

// ---- Inline response bodies ----
function VacancyDraftCard({ data, onAction }) {
  const client = window.ANVI.CLIENTS.find(c => c.id === data.clientId);
  return (
    <div className="rcard">
      <div className="rcard-head">
        <div>
          <div className="rcard-eyebrow">New vacancy · draft</div>
          <div className="rcard-title">{data.title}</div>
        </div>
        <Pill tone="accent">{data.seniority}</Pill>
      </div>
      <div className="kv-grid">
        <div className="kv"><span>Client</span><b>{client.company}</b></div>
        <div className="kv"><span>Budget</span><b>{data.budget}</b></div>
        <div className="kv"><span>Type</span><b>Outstaff · Full-time</b></div>
        <div className="kv"><span>Location</span><b>Remote · EU / LATAM</b></div>
      </div>
      <div className="tag-row">
        {data.stack.map(s => <span key={s} className="tag">{s}</span>)}
      </div>
      <div className="rcard-actions">
        <button className="btn btn-primary" onClick={() => onAction("find", data)}>
          <Icon name="sparkle2" size={15} /> Find matches</button>
        <button className="btn btn-ghost" onClick={() => onAction("telegram", data)}>
          <Icon name="telegram" size={15} /> Post to Telegram</button>
        <button className="btn btn-ghost" onClick={() => onAction("vacancy", data)}>Open vacancy</button>
      </div>
    </div>
  );
}

function CandidateResult({ x, onAction }) {
  const { c, m } = x;
  const band = window.matchBand(m);
  return (
    <div className="cres" onClick={() => onAction("candidate", c)}>
      <MatchRing score={m} size={44} />
      <Avatar initials={c.initials} flag={c.flag} size={40} />
      <div className="cres-main">
        <div className="cres-name">{c.name}{c.tag && <span className="cres-tag">{c.tag}</span>}</div>
        <div className="cres-sub">{c.title} · {c.city}, {c.country} · {c.years}y · {c.english}</div>
        <div className="tag-row tag-row-sm">
          {c.skills.slice(0, 5).map(s => <span key={s} className="tag tag-sm">{s}</span>)}
        </div>
      </div>
      <div className="cres-right">
        <div className="cres-rate">${c.clientRate}<span>/hr</span></div>
        <div className="cres-avail">{c.availability}</div>
      </div>
    </div>
  );
}

function CandidatesBody({ data, onAction }) {
  return (
    <div>
      <div className="cres-list">
        {data.list.map(x => <CandidateResult key={x.c.id} x={x} onAction={onAction} />)}
      </div>
      <div className="rcard-actions" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => onAction("shortlist", data)}>
          <Icon name="share" size={15} /> Build client shortlist</button>
        <button className="btn btn-ghost" onClick={() => onAction("pipeline", data.vac)}>
          <Icon name="grid" size={15} /> Open pipeline</button>
      </div>
    </div>
  );
}

function TelegramBody({ data }) {
  const v = data.vac;
  return (
    <div className="tg-preview">
      <div className="tg-head"><Icon name="telegram" size={16} /> {v.telegram}</div>
      <div className="tg-body">
        <b>🔄 Pipeline update — {v.title}</b><br/><br/>
        Sourced: {v.counts.sourced}<br/>
        Screened: {v.counts.screening}<br/>
        Strong matches: 2<br/>
        Sent to client: {v.counts.sent}<br/>
        Awaiting client: 1
      </div>
      <div className="rcard-actions">
        <button className="btn btn-primary"><Icon name="check" size={15} /> Approve & post</button>
        <button className="btn btn-ghost">Edit</button>
      </div>
    </div>
  );
}

function ScreeningBody() {
  const qs = [
    "Walk through a SaaS feature you built end-to-end — your role on front and back end?",
    "How do you structure a Next.js app for SSR + client interactivity at scale?",
    "Describe your Postgres schema-design and query-optimisation approach.",
    "Which AI coding tools are in your daily workflow, and for what exactly?",
    "How do you handle auth, roles and multi-tenancy in a B2B product?",
  ];
  return (
    <ol className="screen-list">
      {qs.map((q, i) => <li key={i}>{q}</li>)}
    </ol>
  );
}

function ClientBody({ onAction }) {
  const top = window.ANVI.CANDIDATES.filter(c => ["c-artem","c-olek","c-sofia"].includes(c.id));
  return (
    <div className="rcard">
      <div className="rcard-eyebrow">Executive summary · client-ready</div>
      <div className="client-sum">
        {top.map(c => (
          <div key={c.id} className="client-sum-row">
            <b>{c.name}</b> — {c.match["v-fullstack"]}% · {c.country} · ${c.clientRate}/hr · {c.tag}
          </div>
        ))}
      </div>
      <div className="rcard-actions">
        <button className="btn btn-primary" onClick={() => onAction("shortlist", {})}>
          <Icon name="share" size={15} /> Open Shortlist builder</button>
      </div>
    </div>
  );
}

function FallbackBody({ onAction }) {
  return (
    <div className="tag-row" style={{ marginTop: 4 }}>
      {STARTERS.map(s => (
        <button key={s.label} className="suggest-mini" onClick={() => onAction("prompt", s.label)}>
          <Icon name={s.icon} size={14} /> {s.label}
        </button>
      ))}
    </div>
  );
}

function ResponseBody({ kind, data, onAction }) {
  if (kind === "vacancy") return <VacancyDraftCard data={data} onAction={onAction} />;
  if (kind === "candidates") return <CandidatesBody data={data} onAction={onAction} />;
  if (kind === "telegram") return <TelegramBody data={data} />;
  if (kind === "screening") return <ScreeningBody />;
  if (kind === "client") return <ClientBody onAction={onAction} />;
  return <FallbackBody onAction={onAction} />;
}

Object.assign(window, { interpret, STARTERS, ResponseBody });
