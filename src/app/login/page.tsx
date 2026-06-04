"use client";

import React, { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error === "rate_limited" ? "Too many attempts — wait a minute." : "Invalid email or password.");
        setBusy(false);
        return;
      }
      const params = new URLSearchParams(location.search);
      location.href = params.get("next") || "/";
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--paper)" }}>
      <form onSubmit={submit} className="rcard" style={{ width: 360, maxWidth: "90vw" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
          <div className="brand-mark">A</div>
          <div className="brand-name">ANVI</div>
        </div>
        <div className="rcard-title" style={{ marginBottom: 4 }}>Sign in</div>
        <div style={{ fontSize: 13, color: "var(--mute)", marginBottom: 16 }}>Recruiter access.</div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Email</label>
        <input className="resolve-input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle} required />
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Password</label>
        <input className="resolve-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={inputStyle} required />
        {error && <div className="banner banner-bad" style={{ marginBottom: 12 }}>{error}</div>}
        <button className="btn btn-primary btn-full" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 11,
  padding: "10px 13px",
  fontSize: 14,
  outline: "none",
  margin: "5px 0 14px",
};
