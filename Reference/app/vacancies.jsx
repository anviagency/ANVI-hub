// ANVI — Vacancies list + pipeline detail
const { useState: useSVac } = React;

function VacancyRow({ v, onOpen }) {
  const client = window.ANVI.CLIENTS.find(c => c.id === v.clientId);
  const total = v.counts.sourced;
  return (
    <div className="vrow" onClick={() => onOpen(v)}>
      <div className="vrow-main">
        <div className="vrow-top">
          <span className="vrow-title">{v.title}</span>
          <Pill tone={window.STATUS_TONE[v.status] || "default"}>{v.status}</Pill>
          {v.priority === "Urgent" && <Pill tone="bad">Urgent</Pill>}
        </div>
        <div className="vrow-meta">
          <span><Avatar initials={client.initials} size={18} /> {client.company}</span>
          <span>·</span><span>${v.budgetMin}–{v.budgetMax}/hr</span>
          <span>·</span><span>{v.location}</span>
          <span>·</span><span>{v.created}</span>
        </div>
      </div>
      <div className="vrow-funnel">
        <div className="fn"><b>{v.counts.sourced}</b><span>sourced</span></div>
        <Icon name="chevronR" size={13} className="fn-arrow" />
        <div className="fn"><b>{v.counts.screening}</b><span>screening</span></div>
        <Icon name="chevronR" size={13} className="fn-arrow" />
        <div className="fn"><b>{v.counts.sent}</b><span>sent</span></div>
        <Icon name="chevronR" size={13} className="fn-arrow" />
        <div className="fn fn-good"><b>{v.counts.approved}</b><span>approved</span></div>
      </div>
      <Icon name="chevronR" size={18} className="vrow-go" />
    </div>
  );
}

function VacanciesView({ onAction }) {
  const { VACANCIES } = window.ANVI;
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2 className="view-title">Vacancies</h2>
          <p className="view-sub">{VACANCIES.length} active roles across 3 clients</p>
        </div>
        <button className="btn btn-primary" onClick={() => onAction("newvac")}>
          <Icon name="plus" size={16} /> New vacancy</button>
      </div>
      <div className="vrow-list">
        {VACANCIES.map(v => <VacancyRow key={v.id} v={v} onOpen={(vac) => onAction("vacancy", vac)} />)}
      </div>
    </div>
  );
}

const STAGES = [
  { key: "Sourced", label: "Sourced" },
  { key: "Screening", label: "Screening" },
  { key: "Sent to Client", label: "Sent to client" },
  { key: "Approved by Client", label: "Approved" },
];

function PipelineCard({ cand, vacId, onOpen }) {
  const m = cand.match[vacId] || 0;
  return (
    <div className="pcard" onClick={() => onOpen(cand)}>
      <div className="pcard-head">
        <Avatar initials={cand.initials} flag={cand.flag} size={32} />
        <div className="pcard-id">
          <div className="pcard-name">{cand.name}</div>
          <div className="pcard-title">{cand.country} · {cand.years}y</div>
        </div>
      </div>
      <div className="pcard-foot">
        <span className="pcard-match" style={{ color: window.matchBand(m).color }}>{m}% match</span>
        <span className="pcard-rate">${cand.clientRate}/hr</span>
      </div>
    </div>
  );
}

function VacancyDetail({ vac, onBack, onAction }) {
  const { CANDIDATES, CLIENTS } = window.ANVI;
  const client = CLIENTS.find(c => c.id === vac.clientId);
  const pool = CANDIDATES.filter(c => (c.match[vac.id] || 0) >= 40)
    .sort((a, b) => (b.match[vac.id] || 0) - (a.match[vac.id] || 0));
  // distribute: top match in 'Sent', etc. by their status, fallback Sourced
  const byStage = (key) => pool.filter(c => {
    if (key === "Approved by Client") return c.status === "Sent to Client" && c.match[vac.id] >= 86;
    if (key === "Sent to Client") return c.status === "Sent to Client" && c.match[vac.id] < 86;
    if (key === "Screening") return c.status === "Screening";
    return c.status === "Sourced";
  });

  return (
    <div className="view">
      <button className="back-link" onClick={onBack}><Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Vacancies</button>
      <div className="vdetail-head">
        <div>
          <div className="vd-eyebrow"><Avatar initials={client.initials} size={20} /> {client.company} · {client.country}</div>
          <h2 className="view-title">{vac.title}</h2>
          <div className="vd-meta">
            <Pill tone={window.STATUS_TONE[vac.status]}>{vac.status}</Pill>
            <span>${vac.budgetMin}–{vac.budgetMax}/hr client rate</span><span>·</span>
            <span>{vac.seniority}</span><span>·</span><span>{vac.english} English</span><span>·</span>
            <span><Icon name="telegram" size={13} /> {vac.telegram}</span>
          </div>
        </div>
        <div className="vd-actions">
          <button className="btn btn-primary" onClick={() => onAction("findVac", vac)}>
            <Icon name="sparkle2" size={15} /> Find matches</button>
          <button className="btn btn-ghost" onClick={() => onAction("shortlist", { vac })}>
            <Icon name="share" size={15} /> Share shortlist</button>
        </div>
      </div>

      <p className="vd-desc">{vac.description}</p>
      <div className="tag-row" style={{ marginBottom: 8 }}>
        {vac.stack.map(s => <span key={s} className="tag">{s}</span>)}
        {vac.niceToHave.map(s => <span key={s} className="tag tag-ai">{s}</span>)}
      </div>

      <div className="pipeline">
        {STAGES.map(st => {
          const cards = byStage(st.key);
          return (
            <div key={st.key} className="pcol">
              <div className="pcol-head">{st.label}<span className="pcol-count">{cards.length}</span></div>
              <div className="pcol-body">
                {cards.map(c => <PipelineCard key={c.id} cand={c} vacId={vac.id} onOpen={(cand) => onAction("candidate", cand)} />)}
                {cards.length === 0 && <div className="pcol-empty">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { VacanciesView, VacancyDetail });
