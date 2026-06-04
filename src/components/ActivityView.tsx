"use client";

import React, { useEffect, useState } from "react";
import { Pill, Tone } from "@/components/primitives";
import { api, WaMessageItem } from "@/lib/client/api";

const WA_TONE: Record<string, Tone> = {
  sent: "good",
  delivered: "good",
  received: "accent",
  queued: "warn",
  skipped: "default",
  failed: "bad",
};

export function ActivityView() {
  const [wa, setWa] = useState<WaMessageItem[] | null>(null);
  const [notifs, setNotifs] = useState<{ id: string; channel: string; status: string; title: string; createdAt: string }[] | null>(null);

  useEffect(() => {
    api.whatsappMessages().then((d) => setWa(d.messages)).catch(() => setWa([]));
    api.notifications().then((d) => setNotifs(d.notifications)).catch(() => setNotifs([]));
  }, []);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">Activity</div>
          <div className="view-sub">WhatsApp delivery log + system notifications (Telegram / email / recruiter).</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">WhatsApp messages</div>
        {!wa ? (
          <div className="loading">Loading…</div>
        ) : wa.length === 0 ? (
          <div className="empty">No WhatsApp messages yet.</div>
        ) : (
          <table className="status-table">
            <thead>
              <tr><th>When</th><th>Dir</th><th>Event</th><th>To/From</th><th>Status</th><th>Body</th></tr>
            </thead>
            <tbody>
              {wa.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(m.createdAt).toLocaleString()}</td>
                  <td>{m.direction}</td>
                  <td>{m.event ?? "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{m.toNumber ?? m.fromNumber ?? "—"}</td>
                  <td><Pill tone={WA_TONE[m.status] ?? "default"}>{m.status}</Pill></td>
                  <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.body ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">Notifications</div>
        {!notifs ? (
          <div className="loading">Loading…</div>
        ) : notifs.length === 0 ? (
          <div className="empty">No notifications yet.</div>
        ) : (
          <table className="status-table">
            <thead>
              <tr><th>When</th><th>Channel</th><th>Status</th><th>Title</th></tr>
            </thead>
            <tbody>
              {notifs.map((n) => (
                <tr key={n.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(n.createdAt).toLocaleString()}</td>
                  <td>{n.channel}</td>
                  <td><Pill tone={n.status === "sent" ? "good" : n.status === "failed" ? "bad" : "default"}>{n.status}</Pill></td>
                  <td>{n.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
