// ANVI — Client shortlist builder (recruiter side)
const { useState: useSSL } = React;

function ShortlistBuilder({ seed, onClose }) {
  const { CANDIDATES, VACANCIES } = window.ANVI;
  const vac = seed && seed.vac ? seed.vac : VACANCIES.find(v => v.id === "v-fullstack");
  const pool = CANDIDATES.filter(c => (c.match[vac.id] || 0) >= 40)
    .sort((a, b) => (b.match[vac.id] || 0) - (a.match[vac.id] || 0));
  const preselect = seed && seed.cand ? [seed.cand.id]
    : pool.filter(c => c.status === "Sent to Client").map(c => c.id).slice(0, 3);
  const [picked, setPicked] = useSSL(preselect.length ? preselect : pool.slice(0, 3).map(c => c.id));
  const [opts, setOpts] = useSSL({ match: true, cv: true, note: false, rate: true });
  const [expiry, setExpiry] = useSSL("14 days");
  const [stage, setStage] = useSSL("build"); // build -> link

  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const link = `anvi.io/s/${vac.clientId}/${vac.id.replace("v-", "")}`;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow"><Icon name="share" size={14} /> Client shortlist</div>
            <div className="modal-title">{vac.title}</div>
          </div>
          <button className="drawer-x" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        {stage === "build" && (
          <div className="modal-body">
            <div className="sl-section">
              <div className="sec-label">Select candidates · {picked.length} chosen</div>
              <div className="sl-list">
                {pool.map(c => {
                  const on = picked.includes(c.id);
                  return (
                    <button key={c.id} className="sl-row" data-on={on || undefined} onClick={() => toggle(c.id)}>
                      <span className="sl-check" data-on={on || undefined}>{on && <Icon name="check" size={13} stroke={2.4} />}</span>
                      <Avatar initials={c.initials} flag={c.flag} size={34} />
                      <div className="sl-id">
                        <div className="sl-name">{c.name}</div>
                        <div className="sl-sub">{c.country} · {c.years}y · {c.tag || c.title}</div>
                      </div>
                      <span className="sl-match" style={{ color: window.matchBand(c.match[vac.id]).color }}>{c.match[vac.id]}%</span>
                      <span className="sl-rate">${c.clientRate}/hr</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sl-section">
              <div className="sec-label">What the client sees</div>
              <div className="sl-opts">
                {[["match","Match score"],["rate","Client rate & monthly cost"],["cv","CV download"],["note","Recruiter notes"]].map(([k,l]) => (
                  <button key={k} className="opt-toggle" data-on={opts[k] || undefined} onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))}>
                    <span className="opt-sw" data-on={opts[k] || undefined}><i /></span> {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="sl-section sl-inline">
              <div>
                <div className="sec-label">Link expires</div>
                <div className="seg">
                  {["7 days","14 days","No expiry"].map(e => (
                    <button key={e} className="seg-btn" data-on={expiry === e || undefined} onClick={() => setExpiry(e)}>{e}</button>
                  ))}
                </div>
              </div>
              <div className="sl-margin">
                <div className="sec-label">Internal margin (hidden from client)</div>
                <div className="margin-val">
                  ${picked.reduce((s, id) => { const c = pool.find(x => x.id === id); return s + (c ? c.clientRate - c.costRate : 0); }, 0)}/hr blended
                </div>
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={picked.length === 0} onClick={() => setStage("link")}>
                <Icon name="link" size={15} /> Generate client link</button>
            </div>
          </div>
        )}

        {stage === "link" && (
          <div className="modal-body sl-done">
            <div className="sl-done-mark"><Icon name="check" size={30} stroke={2.2} /></div>
            <div className="sl-done-title">Shortlist room is live</div>
            <div className="sl-done-sub">{picked.length} candidates · expires in {expiry} · prepared for {window.ANVI.CLIENTS.find(c => c.id === vac.clientId).name}</div>
            <div className="link-box">
              <Icon name="link" size={15} />
              <span>{link}</span>
              <button className="copy-btn"><Icon name="check" size={14} /> Copy</button>
            </div>
            <div className="sl-share-row">
              <a className="btn btn-primary" href="Client Portal.html" target="_blank" rel="noopener">
                <Icon name="globe" size={15} /> Open client view</a>
              <button className="btn btn-ghost"><Icon name="telegram" size={15} /> Send on Telegram</button>
              <button className="btn btn-ghost"><Icon name="chat" size={15} /> WhatsApp</button>
            </div>
            <div className="sl-track">You'll be notified when {window.ANVI.CLIENTS.find(c => c.id === vac.clientId).name} opens the room or reacts to a candidate.</div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ShortlistBuilder });
