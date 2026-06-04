import React from "react";

export type Tone = "default" | "accent" | "good" | "warn" | "bad";

export function matchBand(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Strong", color: "var(--good)" };
  if (score >= 70) return { label: "Potential", color: "var(--warn)" };
  if (score >= 50) return { label: "Weak", color: "var(--mute)" };
  return { label: "Low", color: "var(--bad)" };
}

export function MatchRing({ score, size = 46 }: { score: number; size?: number }) {
  const band = matchBand(score);
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={band.color}
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: size * 0.3,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: band.color,
        }}
      >
        {score}
      </div>
    </div>
  );
}

export function Avatar({
  initials,
  size = 36,
  accent = false,
  flag = null,
}: {
  initials: string;
  size?: number;
  accent?: boolean;
  flag?: string | null;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        position: "relative",
        background: accent ? "var(--ink)" : "var(--chip)",
        color: accent ? "var(--paper)" : "var(--ink)",
        fontSize: size * 0.36,
        fontWeight: 600,
        letterSpacing: "-0.02em",
        border: accent ? "none" : "1px solid var(--line)",
      }}
    >
      {initials}
      {flag && (
        <span
          style={{ position: "absolute", bottom: -2, right: -2, fontSize: size * 0.34, lineHeight: 1 }}
        >
          {flag}
        </span>
      )}
    </div>
  );
}

export function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={"pill pill-" + tone}>{children}</span>;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  on_hold: "On hold",
  placed: "Placed",
};

const FRESHNESS_TONE: Record<string, Tone> = {
  green: "good",
  yellow: "warn",
  amber: "warn",
  red: "bad",
};

export function FreshnessBadge({
  band,
  label,
  days,
}: {
  band: string;
  label?: string;
  days?: number;
}) {
  return (
    <Pill tone={FRESHNESS_TONE[band] ?? "default"}>
      {label ?? band}
      {days != null ? ` · ${days}d` : ""}
    </Pill>
  );
}

// A compact, explainable score breakdown (Part 3: no black box).
export function ScoreBreakdown({ items }: { items: { label: string; points: number; detail?: string }[] }) {
  const max = Math.max(...items.map((i) => Math.abs(i.points)), 1);
  return (
    <div className="breakdown">
      {items.map((it, i) => (
        <div key={i} className="bd-row">
          <div className="bd-label">{it.label}</div>
          <div className="bd-track">
            <div
              className={"bd-bar " + (it.points >= 0 ? "bd-pos" : "bd-neg")}
              style={{ width: `${(Math.abs(it.points) / max) * 100}%` }}
            />
          </div>
          <div className={"bd-pts " + (it.points >= 0 ? "bd-pos-t" : "bd-neg-t")}>
            {it.points >= 0 ? "+" : ""}
            {it.points}
          </div>
          {it.detail && <div className="bd-detail">{it.detail}</div>}
        </div>
      ))}
    </div>
  );
}
