// ANVI — Client level: all vacancies + candidates under a client
const { useState: useSCl } = React;

function ClientDetail({ client, onAction, onBack }) {
  const { VACANCIES, CANDIDATES } = window.ANVI;
  const vacs = VACANCIES.filter(v => v.clientId === client.id);
  const vacIds = vacs.map(v => v.id);

  // aggregate candidates across this client's roles
  const cands = CANDIDATES
    .filter(c => vacIds.some(vid => (c.match[vid] || 0) >= 40))
    .map(c => {
      const bestVid = vacIds.reduce((a, b) => (c.match[b] || 0) > (c.match[a] || 0) ? b : a, vacIds[0]);
      return { c, vid: bestVid, m: c.match[bestVid] || 0 };
    })
    .sort((a, b) => b.m - a.m);

  const totals = vacs.reduce((acc, v) => ({
    sourced: acc.sourced + v.counts.sourced,
    process: acc.process + v.counts.screening + v.counts.sent,
    approved: acc.approved + v.counts.approved,
  }), { sourced: 0, process: 0, approved: 0 });

  return (
    <div className="view">
      <button className="back-link" onClick={onBack}><Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Clients</button>

      <div className="cl-head">
        <div className="clcard-logo cl-logo-lg">{client.logo}</div>
        <div className="cl-head-info">
          <h2 className="view-title">{client.company}</h2>
          <div className="cl-head-meta">
            <span><Avatar initials={client.initials} size={20} /> {client.name}</span>
            <span>·</span><span><Icon name="globe" size={13} /> {client.country}</span>
            <span>·</span><span><Icon name="clock" size={13} /> {client.tz}</span>
          </div>
        </div>
        <div className="cl-head-actions">
          <button className="btn btn-primary" onClick={() => onAction("prompt", "Open a new role for " + client.name)}><Icon name="plus" size={15} /> New role</button>
          <button className="btn btn-ghost" onClick={() => onAction("shortlist", { vac: vacs[0] })}><Icon name="share" size={15} /> Share shortlist</button>
        </div>
      </div>

      <div className="cl-stats">
        <div className="cl-stat"><b>{vacs.length}</b><span>open roles</span></div>
        <div className="cl-stat"><b>{totals.sourced}</b><span>sourced</span></div>
        <div className="cl-stat"><b>{totals.process}</b><span>in process</span></div>
        <div className="cl-stat cl-stat-good"><b>{totals.approved}</b><span>approved</span></div>
      </div>

      <div className="cl-section">
        <div className="cl-sec-head">Open roles <span className="cl-sec-count">{vacs.length}</span></div>
        <div className="vrow-list">
          {vacs.map(v => (
            <div key={v.id} className="vrow" onClick={() => onAction("vacancy", v)}>
              <div className="vrow-main">
                <div className="vrow-top">
                  <span className="vrow-title">{v.title}</span>
                  <Pill tone={window.STATUS_TONE[v.status] || "default"}>{v.status}</Pill>
                  {v.priority === "Urgent" && <Pill tone="bad">Urgent</Pill>}
                </div>
                <div className="vrow-meta">
                  <span>${v.budgetMin}–{v.budgetMax}/hr</span><span>·</span>
                  <span>{v.seniority}</span><span>·</span><span>{v.location}</span>
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
          ))}
        </div>
      </div>

      <div className="cl-section">
        <div className="cl-sec-head">Candidates <span className="cl-sec-count">{cands.length}</span></div>
        <div className="cl-cand-list">
          {cands.map(({ c, vid, m }) => {
            const v = vacs.find(x => x.id === vid);
            return (
              <div key={c.id} className="cl-cand" onClick={() => onAction("candidate", c)}>
                <Avatar initials={c.initials} flag={c.flag} size={40} />
                <div className="cl-cand-id">
                  <div className="cl-cand-name">{c.name}</div>
                  <div className="cl-cand-sub">{c.title} · for {v.title}</div>
                </div>
                <div className="cl-cand-tags">
                  {c.skills.slice(0, 3).map(s => <span key={s} className="tag tag-sm">{s}</span>)}
                </div>
                <div className="cl-cand-status"><StatusDot status={c.status} /> {c.status}</div>
                <div className="cl-cand-rate">${c.clientRate}<i>/hr</i></div>
                <div className="cl-cand-match" style={{ color: window.matchBand(m).color }}>{m}%</div>
                <Icon name="chevronR" size={17} className="vrow-go" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// richer Clients index (cards now drill into the client)
function ClientsView({ onAction }) {
  const { CLIENTS, VACANCIES, CANDIDATES } = window.ANVI;
  return (
    <div className="view">
      <div className="view-head">
        <div><h2 className="view-title">Clients</h2><p className="view-sub">{CLIENTS.length} active accounts · every role and candidate rolls up here</p></div>
      </div>
      <div className="client-grid">
        {CLIENTS.map(cl => {
          const vacs = VACANCIES.filter(v => v.clientId === cl.id);
          const vacIds = vacs.map(v => v.id);
          const candCount = CANDIDATES.filter(c => vacIds.some(vid => (c.match[vid] || 0) >= 40)).length;
          const sent = vacs.reduce((s, v) => s + v.counts.sent, 0);
          const approved = vacs.reduce((s, v) => s + v.counts.approved, 0);
          return (
            <div key={cl.id} className="clcard clcard-link" onClick={() => onAction("client", cl)}>
              <div className="clcard-head">
                <div className="clcard-logo">{cl.logo}</div>
                <div><div className="clcard-name">{cl.company}</div><div className="clcard-sub">{cl.name} · {cl.country}</div></div>
                <Icon name="chevronR" size={18} className="clcard-go" />
              </div>
              <div className="clcard-stats">
                <div><b>{vacs.length}</b><span>open roles</span></div>
                <div><b>{candCount}</b><span>candidates</span></div>
                <div><b>{sent}</b><span>sent</span></div>
                <div><b>{approved}</b><span>approved</span></div>
              </div>
              <div className="clcard-roles">
                {vacs.slice(0, 3).map(v => <span key={v.id} className="clcard-role"><Icon name="briefcase" size={11} /> {v.title}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { ClientDetail, ClientsView });
