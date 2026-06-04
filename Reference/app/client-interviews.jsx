// ANVI Client Portal — Interviews: calendar of upcoming + recordings, detail PAGE
const { useState: useIV, useEffect: useIVE, useRef: useIVR } = React;

const IV_WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const IV_MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (d) => pad2(d.getHours()) + ":" + pad2(d.getMinutes());
function relDay(d) {
  const today = new Date("2026-06-04T00:00:00");
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((a - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 14) return "In " + diff + " days";
  return IV_WD[d.getDay()];
}
function icsStamp(d) { return d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + "T" + pad2(d.getHours()) + pad2(d.getMinutes()) + "00"; }
function downloadICS(iv) {
  const start = new Date(iv.dateISO), end = new Date(new Date(iv.dateISO).getTime() + iv.durationMin*60000);
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ANVI//Interviews//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",
    "UID:" + iv.id + "@anvi.io", "DTSTAMP:" + icsStamp(new Date("2026-06-04T09:00:00")),
    "DTSTART:" + icsStamp(start), "DTEND:" + icsStamp(end),
    "SUMMARY:Interview — " + iv.name + " · " + iv.role,
    "DESCRIPTION:" + iv.type + " with " + iv.withWho + ". Join: " + iv.joinUrl,
    "LOCATION:" + iv.mode + " — " + iv.joinUrl, "END:VEVENT", "END:VCALENDAR"];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "interview-" + iv.name.replace(/\s+/g, "-").toLowerCase() + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function VideoPlayer({ video }) {
  const [playing, setPlaying] = useIV(false);
  const [t, setT] = useIV(0);
  const [chapter, setChapter] = useIV(0);
  const raf = useIVR(null);
  const durSec = (() => { const [m, s] = video.dur.split(":").map(Number); return m * 60 + s; })();

  useIVE(() => {
    if (!playing) { cancelAnimationFrame(raf.current); return; }
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      setT(prev => {
        const next = prev + dt / durSec;
        if (next >= 1) { setPlaying(false); return 1; }
        setChapter(Math.min(video.chapters.length - 1, Math.floor(next * video.chapters.length)));
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const cur = new Date(t * durSec * 1000).toISOString().substr(14, 5);
  const isClient = video.kind === "client";
  return (
    <div className="vp">
      <div className={"vp-stage" + (playing ? " playing" : "")} onClick={() => setPlaying(p => !p)}>
        <div className={"vp-bg vp-bg-" + video.kind} />
        <div className="vp-kind">
          {isClient ? <><CIcon name="user" size={12} /> Your interview</> : <><CIcon name="spark" size={12} /> ANVI screening</>}
        </div>
        <div className="vp-faces"><div className="vp-face">{isClient ? "AK" : "DL"}</div></div>
        <button className="vp-play" data-playing={playing || undefined}><CIcon name={playing ? "pause" : "play"} size={26} stroke={1.8} /></button>
        <div className="vp-livedot" data-on={playing || undefined}>{playing ? "● REC playback" : ""}</div>
      </div>
      <div className="vp-bar">
        <button className="vp-mini" onClick={() => setPlaying(p => !p)}><CIcon name={playing ? "pause" : "play"} size={15} /></button>
        <span className="vp-time">{cur}</span>
        <div className="vp-track" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setT((e.clientX - r.left) / r.width); }}>
          <div className="vp-fill" style={{ width: (t * 100) + "%" }} />
          {video.chapters.map((c, i) => <span key={i} className="vp-mark" style={{ left: (i / video.chapters.length * 100) + "%" }} />)}
        </div>
        <span className="vp-time">{video.dur}</span>
      </div>
      <div className="vp-chapters">
        {video.chapters.map((c, i) => (
          <button key={i} className={"vp-chip" + (i === chapter && playing ? " on" : "")}
            onClick={() => { setT(i / video.chapters.length); setChapter(i); }}>{c}</button>
        ))}
      </div>
    </div>
  );
}

// ---- Interview detail as a full page ----
function InterviewPage({ iv, onBack }) {
  const tone = iv.outcomeTone === "good" ? "yes" : iv.outcomeTone === "warn" ? "maybe" : "pass";
  return (
    <div className="cp-page cp-page-wide">
      <div className="cp-back-row">
        <button className="cp-back" onClick={onBack}><CIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back to interviews</button>
      </div>
      <div className="cp-detail-hero">
        <div className="cp-av">{iv.initials}<span className="cp-flag">{iv.flag}</span></div>
        <div style={{ flex: 1 }}>
          <div className="cp-d-name">{iv.name}</div>
          <div className="cp-d-title">{iv.role} · {iv.country} · {iv.match}% match</div>
        </div>
        <span className={"cp-badge cp-badge-" + tone}>{iv.outcome}</span>
      </div>

      <div className="iv-videos">
        {iv.videos.map((v, i) => (
          <div key={i} className="iv-vcol">
            <VideoPlayer video={v} />
            <div className="iv-vmeta">
              <div className="iv-vtitle">{v.title}</div>
              <div className="iv-vby">{v.by} · {v.recorded}</div>
              <p className="iv-vsum"><CIcon name="spark" size={12} /> {v.summary}</p>
            </div>
          </div>
        ))}
      </div>

      {iv.intel && (
        <div className="iv-intel">
          <div className="iv-intel-head">
            <div className="cp-d-label" style={{ margin: 0 }}><CIcon name="sparkle2" size={13} /> Interview intelligence</div>
            <div className="iv-intel-prov"><CIcon name="bolt" size={12} /> Auto-extracted from both recordings</div>
          </div>
          <div className="iv-intel-cols">
            <div>
              <div className="cp-d-label">Scorecard</div>
              <div className="iv-score">
                {iv.intel.scores.map(([label, val], i) => (
                  <div key={i} className="iv-score-row">
                    <span>{label}</span>
                    <div className="iv-score-bar"><div className="iv-score-fill" style={{ width: val + "%" }} /></div>
                    <b>{val}</b>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="cp-d-label">Key moments</div>
              <div className="iv-moments">
                {iv.intel.moments.map((m, i) => (
                  <div key={i} className="iv-moment">
                    <span className="iv-moment-t">{m.t}</span>
                    <div className="iv-moment-x"><b>{m.topic} · {m.v}</b><span>{m.quote}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="iv-rec">
            <CIcon name="spark" size={15} />
            <p><b>ANVI recommendation.</b> {iv.intel.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function InterviewsView({ onOpen }) {
  const { INTERVIEWS, UPCOMING_INTERVIEWS } = window.CLIENT_TEAM;
  const groups = [];
  UPCOMING_INTERVIEWS.slice().sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO)).forEach(iv => {
    const d = new Date(iv.dateISO), key = d.toDateString();
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, date: d, items: [] }; groups.push(g); }
    g.items.push(iv);
  });

  return (
    <div className="cp-section">
      <div className="cp-sec-head">
        <h2 className="cp-sec-title">Interviews</h2>
        <p className="cp-sec-sub">Your interview calendar plus every recording — ANVI's screening and your own interview, in one place.</p>
      </div>

      <div className="iv-up">
        <div className="iv-up-head">
          <div className="iv-up-title"><CIcon name="calendar" size={18} /> Upcoming interviews <span className="iv-up-count">{UPCOMING_INTERVIEWS.length} scheduled</span></div>
        </div>
        {groups.map(g => (
          <div key={g.key} className="iv-day">
            <div className={"iv-day-label" + (relDay(g.date) === "Today" ? " iv-day-today" : "")}>
              {relDay(g.date)}<span>{IV_WD[g.date.getDay()]} · {IV_MO[g.date.getMonth()]} {g.date.getDate()}</span>
            </div>
            <div className="iv-slots">
              {g.items.map(iv => {
                const s = new Date(iv.dateISO);
                return (
                  <div key={iv.id} className="iv-slot">
                    <div className="iv-slot-time"><b>{fmtTime(s)}</b><span>{iv.durationMin}m</span></div>
                    <div className="cp-av cp-av-sm">{iv.initials}<span className="cp-flag">{iv.flag}</span></div>
                    <div className="iv-slot-main">
                      <div className="iv-slot-name">{iv.name} <span className="iv-type">{iv.type}</span></div>
                      <div className="iv-slot-meta"><span>{iv.role}</span><i/><span><CIcon name="video" size={12} /> {iv.mode}</span><i/><span>{iv.withWho}</span></div>
                    </div>
                    <div className="iv-slot-actions">
                      <button className="iv-ics" onClick={() => downloadICS(iv)}><CIcon name="download" size={14} /> Add to calendar</button>
                      <a className="iv-join" href={iv.joinUrl} target="_blank" rel="noopener"><CIcon name="video" size={14} /> Join</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="iv-past-head"><CIcon name="video" size={17} /> Past interviews & recordings</div>
      <div className="iv-grid">
        {INTERVIEWS.map(iv => (
          <div key={iv.id} className="iv-card" onClick={() => onOpen(iv.id)}>
            <div className="iv-thumb">
              <div className={"iv-thumb-bg iv-thumb-" + iv.outcomeTone} />
              <div className="iv-thumb-faces"><span className="iv-tf">{iv.initials}</span><span className="iv-flag">{iv.flag}</span></div>
              <div className="iv-thumb-dur"><CIcon name="video" size={12} /> 2 recordings</div>
              <button className="iv-thumb-play"><CIcon name="play" size={20} stroke={1.8} /></button>
            </div>
            <div className="iv-card-body">
              <div className="iv-card-top">
                <div><div className="iv-card-name">{iv.name}</div><div className="iv-card-role">{iv.role}</div></div>
                <span className={"cp-badge cp-badge-" + (iv.outcomeTone === "good" ? "yes" : iv.outcomeTone === "warn" ? "maybe" : "pass")}>{iv.outcome}</span>
              </div>
              <div className="iv-card-vids">
                {iv.videos.map((v, i) => (
                  <div key={i} className="iv-card-vid">
                    <CIcon name={v.kind === "client" ? "user" : "spark"} size={13} />
                    <span>{v.kind === "client" ? "Your interview" : "ANVI screening"}</span><b>{v.dur}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.CLIENT_INTERVIEWS = { InterviewsView, InterviewPage };
