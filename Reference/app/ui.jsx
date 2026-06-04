// ANVI — shared UI primitives + icon set
const { useState, useEffect, useRef } = React;

// --- Icons (stroke-based, 1.6 weight) ---
const ICONS = {
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
  chat: "M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H9l-4 3.5v-3.5H6.5A2.5 2.5 0 014 13.5z",
  briefcase: "M4 8.5A1.5 1.5 0 015.5 7h13A1.5 1.5 0 0120 8.5V18a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18zM9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M4 12h16",
  users: "M8 11a3 3 0 100-6 3 3 0 000 6zM2.5 19a5.5 5.5 0 0111 0M16 11a3 3 0 10-1.5-5.6M15 13.6a5.5 5.5 0 016.5 5.4",
  send: "M5 12h14M13 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  mic: "M12 4a2.5 2.5 0 012.5 2.5v5a2.5 2.5 0 01-5 0v-5A2.5 2.5 0 0112 4zM6 11a6 6 0 0012 0M12 17v3",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6L6 18",
  chevron: "M6 9l6 6 6-6",
  chevronR: "M9 6l6 6-6 6",
  link: "M9.5 14.5l5-5M8 13l-2 2a3 3 0 004.2 4.2l2-2M16 11l2-2A3 3 0 0013.8 4.8l-2 2",
  share: "M16 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM16 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8.2 10.8l5.6-3.1M8.2 13.2l5.6 3.1",
  telegram: "M21 5L3 12l5 2 2 6 3-4 5 4z",
  filter: "M4 6h16M7 12h10M10 18h4",
  bolt: "M13 3L5 13h5l-1 8 8-10h-5z",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9z",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4l3 2",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sliders: "M5 8h9M18 8h1M5 16h1M10 16h9M14 6v4M6 14v4",
  star: "M12 4l2.3 4.8 5.2.7-3.8 3.6.9 5.1-4.6-2.5-4.6 2.5.9-5.1L4.5 9.5l5.2-.7z",
  building: "M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M15 21V9h3a2 2 0 012 2v10M8 7h2M8 11h2M8 15h2",
  sparkle2: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z",
  calendar: "M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 9h16M8 3v4M16 3v4",
  play: "M8 5.5v13l11-6.5z",
  pause: "M9 5v14M15 5v14",
  video: "M4 7a1 1 0 011-1h9a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1zM15 10l5-3v10l-5-3",
  plane: "M14 4.5l-1.5 6 7 4-.5 2.5-7-2-2 4.5-2 .5.5-4-3.5-2 .5-2 4 1.5z",
  wallet: "M4 7a2 2 0 012-2h11a1 1 0 011 1v2M4 7v10a2 2 0 002 2h13a1 1 0 001-1v-2M4 7h15a1 1 0 011 1v2M17 12a1.5 1.5 0 100 3h4v-3z",
  sun: "M12 7a5 5 0 100 10 5 5 0 000-10zM12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4",
  dollar: "M12 3v18M16 7.5C16 6 14.5 5 12 5s-4 1.2-4 3 2 2.5 4 3 4 1.3 4 3-1.8 3-4 3-4-1-4-2.5",
  heart: "M12 20s-7-4.4-9.2-8.3C1.2 8.5 2.6 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.4 0 4.8 3.5 3.2 6.7C19 15.6 12 20 12 20z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  message: "M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H9l-4 3.5v-3.5H6.5A2.5 2.5 0 014 13.5z",
  user: "M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM5 20a7 7 0 0114 0",
  home: "M4 11l8-7 8 7M6 9.5V20h12V9.5",
};

function Icon({ name, size = 18, className = "", style = {}, stroke = 1.6 }) {
  const d = ICONS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}>
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}

// --- Match score helpers ---
function matchBand(score) {
  if (score >= 85) return { label: "Strong", color: "var(--good)", bg: "var(--good-bg)" };
  if (score >= 70) return { label: "Potential", color: "var(--warn)", bg: "var(--warn-bg)" };
  if (score >= 50) return { label: "Weak", color: "var(--mute)", bg: "var(--chip)" };
  return { label: "Low", color: "var(--mute)", bg: "var(--chip)" };
}

function MatchRing({ score, size = 46 }) {
  const band = matchBand(score);
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={band.color} strokeWidth="3"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center",
        fontSize: size * 0.3, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: band.color }}>
        {score}
      </div>
    </div>
  );
}

function Avatar({ initials, size = 36, accent = false, flag = null }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size, flexShrink: 0,
      display: "grid", placeItems: "center", position: "relative",
      background: accent ? "var(--ink)" : "var(--chip)",
      color: accent ? "var(--paper)" : "var(--ink)",
      fontSize: size * 0.36, fontWeight: 600, letterSpacing: "-0.02em",
      border: accent ? "none" : "1px solid var(--line)",
    }}>
      {initials}
      {flag && <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: size * 0.34,
        lineHeight: 1, filter: "saturate(1.1)" }}>{flag}</span>}
    </div>
  );
}

function Chip({ children, active = false, onClick, accent }) {
  return (
    <button className="chip" onClick={onClick} data-active={active || undefined}
      style={accent ? { color: accent } : {}}>{children}</button>
  );
}

function Pill({ children, tone = "default" }) {
  return <span className={"pill pill-" + tone}>{children}</span>;
}

// Status -> tone
const STATUS_TONE = {
  "Active Search": "accent", "Open": "good", "Urgent": "bad", "High": "warn",
  "Medium": "default", "Waiting for Client": "warn", "Sent to Client": "accent",
  "Screening": "warn", "Sourced": "default", "Approved by Client": "good", "Filled": "good",
};

function StatusDot({ status }) {
  const tone = STATUS_TONE[status] || "default";
  return <span className={"sdot sdot-" + tone} />;
}

// Typewriter hook for AI streaming
function useTypewriter(text, speed = 12, start = true) {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!start) return;
    setOut(""); setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setOut(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setOut(text); setDone(true); }
    }, speed);
    return () => clearInterval(id);
  }, [text, start]);
  return [out, done];
}

Object.assign(window, { Icon, MatchRing, Avatar, Chip, Pill, StatusDot, matchBand, useTypewriter });
