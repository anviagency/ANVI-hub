// ANVI Client Portal — shell, navigation, chat-to-recruiter
const { useState: usePA, useEffect: usePAE, useRef: usePAR } = React;

function ClientChat({ open, onClose }) {
  const [msgs, setMsgs] = usePA([
    { role: "anvi", text: "Hi Andy — I'm your ANVI assistant. Ask me anything about your candidates, interviews, team payroll, or time off." },
  ]);
  const [val, setVal] = usePA("");
  const scrollRef = usePAR(null);
  usePAE(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs]);

  const send = (preset) => {
    const q = (preset || val).trim(); if (!q) return; setVal("");
    setMsgs(m => [...m, { role: "me", text: q }]);
    setTimeout(() => {
      const t = q.toLowerCase();
      let a = "I've flagged that to Daria, your recruiter — she'll follow up shortly.";
      if (t.match(/cheap|budget|rate|price|cost|pay/)) a = "Your team costs $20,112/mo in June across 3 people. Dmytro would be your best-value next hire at $29/hr.";
      else if (t.match(/vacation|leave|time off|holiday/)) a = "Elena is on approved vacation Jun 16–20. Mira requested Jul 7–9 (pending ANVI). Estonia also has 2 public holidays this month (Jun 23–24).";
      else if (t.match(/working day|days/)) a = "June working days by country: Ukraine 22, Romania 20, Estonia 20 — Estonia is lower due to Victory Day and Midsummer.";
      else if (t.match(/interview|video|recording/)) a = "You have 3 interviewed candidates with recordings — each has ANVI's screening plus your own interview. Artem was hired; open Interviews to rewatch.";
      else if (t.match(/best|recommend|who/)) a = "On your team, Artem and Mira are both fully active. For new full-stack roles I'd re-engage Oleksandr (84% — currently on hold).";
      setMsgs(m => [...m, { role: "anvi", text: a }]);
    }, 650);
  };

  return (
    <div className={"cp-chat" + (open ? " open" : "")}>
      <div className="cp-chat-head">
        <div className="cp-chat-title"><span className="cp-chat-dot" /> ANVI Assistant</div>
        <button className="cp-navbtn" onClick={onClose}><CIcon name="x" size={17} /></button>
      </div>
      <div className="cp-chat-scroll" ref={scrollRef}>
        {msgs.map((m,i) => (
          <div key={i} className={"cp-bubble cp-bubble-" + m.role}>
            {m.role === "anvi" && <div className="cp-bubble-badge"><CIcon name="spark" size={13} /></div>}
            <div className="cp-bubble-text">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="cp-chat-suggest">
        {["What does my team cost this month?","Who's on vacation?","Working days by country"].map(s => (
          <button key={s} onClick={() => send(s)}>{s}</button>
        ))}
      </div>
      <div className="cp-chat-input">
        <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder="Ask about candidates, team or payroll…" />
        <button className="cp-chat-send" data-on={!!val.trim()} onClick={()=>send()}><CIcon name="arrowUp" size={17} stroke={2} /></button>
      </div>
    </div>
  );
}

// ---- Shortlist review view (candidate cards) ----
function ShortlistView({ pool, dec, decide, onOpen, onAdd }) {
  const [filter, setFilter] = usePA("all");
  const counts = {
    interview: Object.values(dec).filter(v => v === "interview").length,
    maybe: Object.values(dec).filter(v => v === "maybe").length,
    pass: Object.values(dec).filter(v => v === "pass").length,
  };
  const reviewed = counts.interview + counts.maybe + counts.pass;
  const shown = pool.filter(c => filter === "all" ? true : filter === "todo" ? !dec[c.id] : dec[c.id] === filter);

  return (
    <div className="cp-section">
      <div className="cp-hero">
        <div className="cp-hero-eyebrow"><CIcon name="briefcase" size={13} /> Senior Full-Stack Developer · Outstaff</div>
        <h1 className="cp-hero-title">Your shortlist is ready, <span>Andy</span>.</h1>
        <p className="cp-hero-sub">Daria hand-picked {pool.length} candidates from 248 sourced. Review each, then tap <b>Interview</b> on anyone you like — slots arrive within the hour. No forms, no email threads.</p>
      </div>

      <div className="cp-bar">
        <div className="cp-progress">
          <div className="cp-progress-track"><div className="cp-progress-fill" style={{ width: (reviewed/pool.length*100) + "%" }} /></div>
          <span>{reviewed}/{pool.length} reviewed</span>
        </div>
        <div className="cp-filters">
          {[["all","All"],["todo","To review"],["interview","Interview · "+counts.interview],["maybe","Maybe · "+counts.maybe],["pass","Passed · "+counts.pass]].map(([k,l]) => (
            <button key={k} className={"cp-filter" + (filter===k?" on":"")} onClick={()=>setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="cp-grid">
        {shown.map((c, i) => (
          <window.CLIENT_CARDS.ClientCard key={c.id} c={c} idx={i} decision={dec[c.id]} onOpen={onOpen} onDecide={decide} />
        ))}
        <div className="cp-add-card" onClick={onAdd}>
          <div className="cp-add-ic"><CIcon name="plus" size={22} stroke={2} /></div>
          <b>Add a candidate</b>
          <p>Have someone in mind? We'll screen &amp; vet them for you.</p>
        </div>
      </div>

      {counts.interview > 0 && (
        <div className="cp-cta">
          <div><b>{counts.interview} interview{counts.interview>1?"s":""} requested.</b> Daria will send time slots in your timezone shortly.</div>
          <button className="cp-cta-btn"><CIcon name="send" size={15} /> Confirm & notify recruiter</button>
        </div>
      )}
    </div>
  );
}

const CP_NAV = [
  { key: "shortlist", icon: "users", label: "Shortlist" },
  { key: "interviews", icon: "video", label: "Interviews" },
  { key: "team", icon: "briefcase", label: "My Team" },
];

// ---- Add a candidate (AI field or file) ----
function AddCandidatePage({ onBack }) {
  const [text, setText] = usePA("");
  const [file, setFile] = usePA(null);
  const [done, setDone] = usePA(false);
  const fileRef = usePAR(null);
  const canSubmit = text.trim().length > 3 || file;

  if (done) {
    return (
      <div className="cp-page">
        <div className="cp-back-row"><button className="cp-back" onClick={onBack}><CIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back to shortlist</button></div>
        <div className="rm-done" style={{ padding: "26px 10px" }}>
          <div className="sl-done-mark" style={{ background: "var(--good-bg)", color: "var(--good)" }}><CIcon name="check" size={28} stroke={2.2} /></div>
          <div className="rm-done-title">Candidate sent to ANVI</div>
          <div className="rm-done-sub">ANVI is parsing {file ? file.name : "the profile"} now — we'll screen, vet and add them to your shortlist, usually within a day. You'll be notified.</div>
          <button className="cp-cta-btn" onClick={onBack}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      <div className="cp-back-row"><button className="cp-back" onClick={onBack}><CIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back to shortlist</button></div>
      <div className="cp-detail-hero" style={{ marginBottom: 16 }}>
        <div className="cp-av"><CIcon name="plus" size={24} stroke={2} /></div>
        <div style={{ flex: 1 }}>
          <div className="cp-d-name" style={{ fontSize: 22 }}>Add a candidate</div>
          <div className="cp-d-title">Know someone great? Paste their CV, a LinkedIn link or a note — or drop a file. ANVI screens, vets and adds them to your shortlist.</div>
        </div>
      </div>
      <div className="addc">
        <textarea className="addc-ta" value={text} onChange={e => setText(e.target.value)}
          placeholder="Paste a CV, a LinkedIn URL, or describe the candidate — e.g. “Senior React dev, 6y, Lisbon, ~$35/hr, linkedin.com/in/…”" />
        <div className="addc-or">or attach a file</div>
        <div className="addc-drop" onClick={() => fileRef.current && fileRef.current.click()}>
          <div className="addc-drop-ic"><CIcon name="doc" size={18} /></div>
          <div>
            {file ? <b className="addc-drop-file">{file.name}</b> : <b>Drop a CV or Excel</b>}
            <span>{file ? "Click to replace" : "PDF, DOCX or .xlsx — ANVI parses it automatically"}</span>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" style={{ display: "none" }} onChange={e => setFile(e.target.files[0] || null)} />
        </div>
      </div>
      <div className="emp-actions" style={{ marginTop: 18 }}>
        <button className="cp-cta-btn" style={!canSubmit ? { opacity: .45, cursor: "not-allowed" } : {}} onClick={() => canSubmit && setDone(true)}>
          <CIcon name="sparkle2" size={15} /> Send to ANVI</button>
        <button className="cp-mini" style={{ flex: "none", padding: "0 18px", height: 46 }} onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}

function ClientPortal() {
  const pool = window.CLIENT.clientPool();
  const [dec, setDec] = window.CLIENT.useDecisions();
  const decide = (id, v) => setDec(id, v);
  const [tab, setTab] = usePA(() => localStorage.getItem("anvi_cp_tab") || "shortlist");
  const [page, setPage] = usePA(null); // { kind, id }
  const [chat, setChat] = usePA(false);

  const { INTERVIEWS, TEAM } = window.CLIENT_TEAM;
  const openPage = (kind, id) => { setPage({ kind, id }); window.scrollTo({ top: 0 }); };
  const back = () => { setPage(null); window.scrollTo({ top: 0 }); };
  const goTab = (t) => { setPage(null); setTab(t); localStorage.setItem("anvi_cp_tab", t); window.scrollTo({ top: 0 }); };

  const candIdx = page && page.kind === "candidate" ? pool.findIndex(c => c.id === page.id) : -1;
  const stepCand = (d) => { const n = (candIdx + d + pool.length) % pool.length; openPage("candidate", pool[n].id); };

  const renderPage = () => {
    if (page.kind === "candidate") {
      const c = pool.find(x => x.id === page.id);
      return <window.CLIENT_CARDS.CandidatePage c={c} decision={dec[c.id]} onDecide={(v)=>decide(c.id, v)}
        onBack={back} onPrev={()=>stepCand(-1)} onNext={()=>stepCand(1)} />;
    }
    if (page.kind === "interview") {
      return <window.CLIENT_INTERVIEWS.InterviewPage iv={INTERVIEWS.find(x => x.id === page.id)} onBack={back} />;
    }
    if (page.kind === "employee") {
      return <window.CLIENT_TEAMVIEW.EmployeePage emp={TEAM.find(x => x.id === page.id)} onBack={back} onReport={(id)=>openPage("report", id)} />;
    }
    if (page.kind === "report") {
      return <window.CLIENT_TEAMVIEW.ReportPage emp={TEAM.find(x => x.id === page.id)} onBack={()=>goTab("team")} />;
    }
    if (page.kind === "addcand") {
      return <AddCandidatePage onBack={()=>goTab("shortlist")} />;
    }
    return null;
  };

  return (
    <div className="cp">
      {!page && <div className="cp-glow" />}
      <header className="cp-head">
        <div className="cp-brand">
          <img className="cp-brand-logo" src={(window.__resources && window.__resources.anviLogo) || "assets/anvi-logo.png"} alt="ANVI" />
          <div className="cp-brand-sub">Outstaffing partner</div>
        </div>
        <nav className="cp-nav">
          {CP_NAV.map(n => (
            <button key={n.key} className={"cp-nav-item" + (!page && tab===n.key?" on":"")} onClick={() => goTab(n.key)}>
              <CIcon name={n.icon} size={16} /> <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="cp-head-right">
          <div className="cp-expiry"><CIcon name="clock" size={13} /> June 2026</div>
          <div className="cp-user">AK</div>
        </div>
      </header>

      <main className="cp-main">
        {page ? renderPage() : (
          tab === "shortlist" ? <ShortlistView pool={pool} dec={dec} decide={decide} onOpen={(id)=>openPage("candidate", id)} onAdd={()=>openPage("addcand")} />
          : tab === "interviews" ? <window.CLIENT_INTERVIEWS.InterviewsView onOpen={(id)=>openPage("interview", id)} />
          : <window.CLIENT_TEAMVIEW.MyTeamView onOpen={(id)=>openPage("employee", id)} onReport={(id)=>openPage("report", id)} />
        )}
      </main>

      <button className="cp-fab" onClick={() => setChat(true)}>
        <CIcon name="chat" size={18} /> <span>Ask ANVI</span>
      </button>
      <ClientChat open={chat} onClose={() => setChat(false)} />
      {chat && <div className="cp-chat-scrim" onClick={() => setChat(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ClientPortal />);
