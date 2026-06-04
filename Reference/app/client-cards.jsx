// ANVI Client Portal — candidate card + candidate detail PAGE
const { useState: useP, useEffect: usePE, useRef: usePR } = React;

function CIcon({ name, size = 18, stroke = 1.6, style = {} }) { return <Icon name={name} size={size} stroke={stroke} style={style} />; }

// ---- Candidate detail as a full page ----
function CandidatePage({ c, decision, onDecide, onBack, onPrev, onNext }) {
  const band = window.matchBand(c.match);
  usePE(() => {
    const h = (e) => {
      if (e.key === "Escape") onBack();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "1") onDecide("pass");
      else if (e.key === "2") onDecide("maybe");
      else if (e.key === "3") onDecide("interview");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [c.id, decision]);

  return (
    <div className="cp-page">
      <div className="cp-back-row">
        <button className="cp-back" onClick={onBack}><CIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back to shortlist</button>
        <div style={{ flex: 1 }} />
        <button className="cp-navbtn" onClick={onPrev} title="Previous"><CIcon name="chevron" size={18} style={{ transform: "rotate(90deg)" }} /></button>
        <button className="cp-navbtn" onClick={onNext} title="Next"><CIcon name="chevron" size={18} style={{ transform: "rotate(-90deg)" }} /></button>
      </div>

      <div className="cp-detail-hero">
        <div className="cp-av">{c.initials}<span className="cp-flag">{c.flag}</span></div>
        <div style={{ flex: 1 }}>
          <div className="cp-d-name">{c.name}</div>
          <div className="cp-d-title">{c.title}</div>
          <div className="cp-d-meta">
            <span><CIcon name="globe" size={13} /> {c.city}, {c.country}</span>
            <span><CIcon name="clock" size={13} /> {c.tz}</span>
            <span><CIcon name="star" size={13} /> {c.english}</span>
          </div>
        </div>
        <div className="cp-d-score">
          <window.CLIENT.CMatchRing score={c.match} size={66} />
          <span style={{ color: band.color }}>{band.label} fit</span>
        </div>
      </div>

      <div className="cp-d-facts">
        <div><span>Rate</span><b>${c.rate}<i>/hr</i></b></div>
        <div><span>Monthly</span><b>{c.monthly}</b></div>
        <div><span>Available</span><b>{c.availability}</b></div>
        <div><span>Experience</span><b>{c.years} years</b></div>
      </div>

      <div className="cp-d-sec">
        <div className="cp-d-label"><CIcon name="spark" size={13} /> ANVI summary</div>
        <p className="cp-d-summary">{c.summary}</p>
      </div>

      <div className="cp-d-cols">
        <div>
          <div className="cp-d-label">Strengths</div>
          <ul className="cp-fit cp-fit-good">{c.fits.map((f,i)=><li key={i}><CIcon name="check" size={13} /> {f}</li>)}</ul>
        </div>
        <div>
          <div className="cp-d-label">Consider</div>
          <ul className="cp-fit cp-fit-warn">{c.risks.map((f,i)=><li key={i}><CIcon name="x" size={13} /> {f}</li>)}</ul>
        </div>
      </div>

      <div className="cp-d-sec">
        <div className="cp-d-label">Stack</div>
        <div className="cp-tags">
          {c.skills.map(s=><span key={s} className="cp-tag">{s}</span>)}
          {c.aiTools.map(s=><span key={s} className="cp-tag cp-tag-ai">{s}</span>)}
        </div>
      </div>

      <div className="cp-d-actions">
        <button className={"cp-act cp-pass" + (decision==="pass"?" on":"")} onClick={() => onDecide("pass")}>
          <CIcon name="x" size={17} stroke={2} /> Pass</button>
        <button className={"cp-act cp-maybe" + (decision==="maybe"?" on":"")} onClick={() => onDecide("maybe")}>
          <CIcon name="clock" size={16} stroke={2} /> Maybe</button>
        <button className={"cp-act cp-yes" + (decision==="interview"?" on":"")} onClick={() => onDecide("interview")}>
          <CIcon name="check" size={17} stroke={2} /> Request interview</button>
      </div>
    </div>
  );
}

function DecisionBadge({ d }) {
  if (!d) return null;
  const map = { interview: ["Interview", "yes"], maybe: ["Maybe", "maybe"], pass: ["Passed", "pass"] };
  const [label, cls] = map[d];
  return <span className={"cp-badge cp-badge-" + cls}>{label}</span>;
}

function ClientCard({ c, decision, onOpen, onDecide, idx }) {
  const band = window.matchBand(c.match);
  return (
    <div className={"cp-card" + (decision ? " cp-card-" + decision : "")} style={{ animationDelay: (idx*70) + "ms" }} onClick={() => onOpen(c.id)}>
      <div className="cp-card-top">
        <div className="cp-av cp-av-sm">{c.initials}<span className="cp-flag">{c.flag}</span></div>
        <div className="cp-card-id">
          <div className="cp-card-name">{c.name} <DecisionBadge d={decision} /></div>
          <div className="cp-card-title">{c.title} · {c.country}</div>
        </div>
        <window.CLIENT.CMatchRing score={c.match} size={50} />
      </div>

      {c.tag && <div className="cp-card-tag" style={{ color: band.color }}><CIcon name="bolt" size={12} /> {c.tag}</div>}
      <p className="cp-card-sum">{c.summary}</p>

      <div className="cp-card-facts">
        <span><b>${c.rate}</b>/hr</span><i/>
        <span><b>{c.availability}</b></span><i/>
        <span><b>{c.english}</b> Eng</span>
      </div>

      <div className="cp-tags cp-tags-sm">
        {c.skills.slice(0,5).map(s=><span key={s} className="cp-tag">{s}</span>)}
      </div>

      <div className="cp-card-actions" onClick={e=>e.stopPropagation()}>
        <button className={"cp-mini cp-mini-pass" + (decision==="pass"?" on":"")} onClick={()=>onDecide(c.id,"pass")} title="Pass"><CIcon name="x" size={16} stroke={2.2} /></button>
        <button className={"cp-mini cp-mini-maybe" + (decision==="maybe"?" on":"")} onClick={()=>onDecide(c.id,"maybe")} title="Maybe"><CIcon name="clock" size={15} stroke={2.1} /></button>
        <button className={"cp-mini cp-mini-yes" + (decision==="interview"?" on":"")} onClick={()=>onDecide(c.id,"interview")} title="Request interview"><CIcon name="check" size={16} stroke={2.2} /> Interview</button>
      </div>
    </div>
  );
}

window.CLIENT_CARDS = { ClientCard, CandidatePage };
