// ANVI Client Portal — the candidate review room for the client
const { useState: useCP, useEffect: useCPE, useRef: useCPR } = React;

// Client sees these (recruiter rates shown as client rate; no internal cost)
function clientPool() {
  const { CANDIDATES } = window.ANVI;
  // Top full-stack shortlist, client-facing fields only
  return CANDIDATES
    .filter(c => ["c-artem","c-olek","c-sofia","c-dmytro"].includes(c.id))
    .sort((a,b) => b.match["v-fullstack"] - a.match["v-fullstack"])
    .map(c => ({
      id: c.id, name: c.name, title: c.title, initials: c.initials, flag: c.flag,
      country: c.country, city: c.city, tz: c.tz, years: c.years, english: c.english,
      availability: c.availability, rate: c.clientRate, monthly: c.salary,
      match: c.match["v-fullstack"], tag: c.tag, summary: c.summary,
      skills: c.skills, aiTools: c.aiTools, fits: c.fits, risks: c.risks,
    }));
}

// Persist client decisions
function useDecisions() {
  const [dec, setDec] = useCP(() => {
    try { return JSON.parse(localStorage.getItem("anvi_client_dec") || "{}"); } catch { return {}; }
  });
  const set = (id, v) => setDec(d => { const n = { ...d, [id]: d[id] === v ? null : v }; localStorage.setItem("anvi_client_dec", JSON.stringify(n)); return n; });
  return [dec, set];
}

function CMatchRing({ score, size = 52 }) {
  const band = window.matchBand(score);
  const r = (size - 7) / 2, c = 2 * Math.PI * r, off = c - (score/100) * c;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={band.color} strokeWidth="3.5"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition:"stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center",
        fontSize:size*0.3, fontWeight:600, color:"#fff", fontVariantNumeric:"tabular-nums" }}>{score}</div>
    </div>
  );
}

window.CLIENT = { clientPool, useDecisions, CMatchRing };
