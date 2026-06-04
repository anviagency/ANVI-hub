// ANVI — Candidate database + detail drawer
const { useState: useSCand } = React;

function CandidateDrawer({ cand, vacId, onClose, onAction }) {
  if (!cand) return null;
  const m = vacId ? (cand.match[vacId] || 0) : Math.max(...Object.values(cand.match));
  const band = window.matchBand(m);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <button className="drawer-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="drawer-top">
          <Avatar initials={cand.initials} flag={cand.flag} size={56} />
          <div style={{ flex: 1 }}>
            <div className="drawer-name">{cand.name}</div>
            <div className="drawer-title">{cand.title}</div>
            <div className="drawer-meta">
              <span><Icon name="globe" size={13} /> {cand.city}, {cand.country}</span>
              <span><Icon name="clock" size={13} /> {cand.tz}</span>
              <span><Icon name="briefcase" size={13} /> {cand.years}y</span>
            </div>
          </div>
          <div className="drawer-score">
            <MatchRing score={m} size={62} />
            <span style={{ color: band.color }}>{band.label}</span>
          </div>
        </div>

        <div className="drawer-rates">
          <div className="rate-box"><span>Client rate</span><b>${cand.clientRate}<i>/hr</i></b></div>
          <div className="rate-box"><span>Est. monthly</span><b>{cand.salary}</b></div>
          <div className="rate-box rate-internal"><span>Internal cost</span><b>${cand.costRate}<i>/hr</i></b></div>
          <div className="rate-box rate-margin"><span>Margin</span><b>${cand.clientRate - cand.costRate}<i>/hr</i></b></div>
        </div>

        <div className="drawer-sec">
          <div className="sec-label">AI summary</div>
          <p className="ai-summary">{cand.summary}</p>
        </div>

        <div className="drawer-cols">
          <div className="drawer-sec">
            <div className="sec-label">Why this fits</div>
            <ul className="fit-list fit-good">{cand.fits.map((f,i) => <li key={i}><Icon name="check" size={13} /> {f}</li>)}</ul>
          </div>
          <div className="drawer-sec">
            <div className="sec-label">Watch-outs</div>
            <ul className="fit-list fit-warn">{cand.risks.map((f,i) => <li key={i}><Icon name="x" size={13} /> {f}</li>)}</ul>
          </div>
        </div>

        <div className="drawer-sec">
          <div className="sec-label">Skills</div>
          <div className="tag-row">{cand.skills.map(s => <span key={s} className="tag">{s}</span>)}
            {cand.aiTools.map(s => <span key={s} className="tag tag-ai">{s}</span>)}</div>
        </div>

        <div className="drawer-actions">
          <button className="btn btn-primary" onClick={() => onAction("shortlist", { cand })}>
            <Icon name="share" size={15} /> Add to client shortlist</button>
          <button className="btn btn-ghost"><Icon name="doc" size={15} /> View CV</button>
          <button className="btn btn-ghost"><Icon name="telegram" size={15} /> Update Telegram</button>
        </div>
      </div>
    </div>
  );
}

function CandidateCard({ cand, sortVac, onOpen }) {
  const m = cand.match[sortVac] || Math.max(...Object.values(cand.match));
  return (
    <div className="ccard" onClick={() => onOpen(cand)}>
      <div className="ccard-head">
        <Avatar initials={cand.initials} flag={cand.flag} size={42} />
        <div className="ccard-id">
          <div className="ccard-name">{cand.name}</div>
          <div className="ccard-title">{cand.title}</div>
        </div>
        <MatchRing score={m} size={40} />
      </div>
      <div className="ccard-meta">
        <span><Icon name="globe" size={12} /> {cand.country}</span>
        <span><Icon name="clock" size={12} /> {cand.availability}</span>
        <span><Icon name="star" size={12} /> {cand.english}</span>
      </div>
      <div className="tag-row tag-row-sm">
        {cand.skills.slice(0, 4).map(s => <span key={s} className="tag tag-sm">{s}</span>)}
        {cand.skills.length > 4 && <span className="tag tag-sm tag-more">+{cand.skills.length - 4}</span>}
      </div>
      <div className="ccard-foot">
        <span className="ccard-rate">${cand.clientRate}<i>/hr</i></span>
        <span className="ccard-status"><StatusDot status={cand.status} /> {cand.status}</span>
      </div>
    </div>
  );
}

function CandidatesView({ onAction }) {
  const { CANDIDATES, VACANCIES } = window.ANVI;
  const [q, setQ] = useSCand("");
  const [sortVac, setSortVac] = useSCand("v-fullstack");
  const [aiMode, setAiMode] = useSCand(false);
  const [adding, setAdding] = useSCand(false);
  const [addText, setAddText] = useSCand("");
  const [addFile, setAddFile] = useSCand(null);
  const [addDone, setAddDone] = useSCand(false);
  const canAdd = addText.trim().length > 3 || addFile;
  const resetAdd = () => { setAddText(""); setAddFile(null); setAddDone(false); };

  const filtered = CANDIDATES
    .filter(c => {
      const s = q.toLowerCase();
      if (!s) return true;
      return (c.name + c.title + c.country + c.skills.join(" ") + c.aiTools.join(" ")).toLowerCase().includes(s);
    })
    .sort((a, b) => (b.match[sortVac] || 0) - (a.match[sortVac] || 0));

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2 className="view-title">Talent pool</h2>
          <p className="view-sub">248 candidates · ranked for {VACANCIES.find(v => v.id === sortVac).title}</p>
        </div>
        <div className="tp-head-right">
          <div className="vac-switch">
            {VACANCIES.map(v => (
              <button key={v.id} className="vsw" data-active={sortVac === v.id || undefined}
                onClick={() => setSortVac(v.id)}>{v.title.split(" ")[0] === "Senior" ? v.title.split(" ").slice(1).join(" ") : v.title.split(" (")[0]}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => { setAdding(a => !a); setAddDone(false); }}>
            <Icon name="plus" size={16} /> Add candidate</button>
        </div>
      </div>

      {adding && (
        <div className="tp-add">
          {addDone ? (
            <div className="tp-add-done">
              <span className="tp-add-check"><Icon name="check" size={16} stroke={2.2} /></span>
              <div style={{ flex: 1 }}><b>Sent to ANVI.</b> Parsing &amp; screening {addFile ? addFile.name : "the profile"} — it'll appear in the pool with a match score shortly.</div>
              <button className="btn btn-ghost" onClick={resetAdd}>Add another</button>
              <button className="btn btn-ghost" onClick={() => { setAdding(false); resetAdd(); }}>Done</button>
            </div>
          ) : (
            <>
              <div className="tp-add-head"><Icon name="sparkle2" size={15} /> Add a candidate <span>Paste a CV, a LinkedIn URL or a note — or drop a file. ANVI parses, scores and adds them.</span></div>
              <textarea className="tp-add-ta" value={addText} onChange={e => setAddText(e.target.value)}
                placeholder={"Paste a CV, a LinkedIn URL, or describe the candidate \u2014 e.g. \u201cSenior React dev, 6y, Lisbon, ~$35/hr, linkedin.com/in/\u2026\u201d"} />
              <div className="tp-add-row">
                <label className="tp-add-file">
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" hidden onChange={e => setAddFile(e.target.files[0] || null)} />
                  <Icon name="doc" size={15} /> {addFile ? addFile.name : "Attach CV or Excel"}
                </label>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={!canAdd} onClick={() => canAdd && setAddDone(true)}>
                  <Icon name="sparkle2" size={15} /> Parse &amp; add</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className={"search-shell" + (aiMode ? " search-ai" : "")}>
        <Icon name={aiMode ? "sparkle2" : "search"} size={18} className="search-ic" />
        <input className="search-input" value={q} onChange={e => setQ(e.target.value)}
          placeholder={aiMode ? "Senior full-stack, React + Next.js, AI tools, under $36/hr…" : "Search name, skill, country…"} />
        <button className="ai-toggle" data-on={aiMode} onClick={() => setAiMode(!aiMode)}>
          <Icon name="sparkle2" size={14} /> AI search
        </button>
      </div>

      <div className="ccard-grid">
        {filtered.map(c => <CandidateCard key={c.id} cand={c} sortVac={sortVac} onOpen={(cand) => onAction("candidate", cand)} />)}
      </div>
    </div>
  );
}

Object.assign(window, { CandidateDrawer, CandidateCard, CandidatesView });
