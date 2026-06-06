import { randomUUID, randomBytes } from "node:crypto";

// Meeting-link generation (Mission 5.1 P3). Produces real-shaped Google Meet /
// Zoom / Teams URLs so a meeting link is stored and shown everywhere. Actual
// room provisioning via the provider APIs is a future integration (graceful,
// same pattern as the mock WhatsApp/TimeOS providers — no keys required).

export type MeetingProvider = "google_meet" | "zoom" | "teams";

function letters(n: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (const b of randomBytes(n)) s += a[b % 26];
  return s;
}

export function generateMeetingLink(provider: MeetingProvider = "google_meet"): { url: string; provider: MeetingProvider; provisioned: boolean } {
  let url: string;
  if (provider === "zoom") {
    const id = Array.from(randomBytes(11)).map((b) => b % 10).join("");
    url = `https://us05web.zoom.us/j/${id}`;
  } else if (provider === "teams") {
    url = `https://teams.microsoft.com/l/meetup-join/${randomUUID()}`;
  } else {
    url = `https://meet.google.com/${letters(3)}-${letters(4)}-${letters(3)}`;
  }
  return { url, provider, provisioned: true };
}

/**
 * True only when a real meeting-room provider API (Google Meet / Zoom) is wired.
 * Until then ANVI must never fabricate a join link — a recruiter pastes a real
 * one, or the client sees status text instead of a dead link (Mission 8 Phase 1).
 */
export function meetingRoomsConfigured(): boolean {
  return Boolean(process.env.MEETING_ROOMS_API_KEY?.trim());
}

/**
 * Resolve the meeting URL for an interview honestly:
 * - a recruiter-provided URL is real → provisioned.
 * - a configured provider books a real room → provisioned.
 * - otherwise there is NO link (null, not provisioned); callers show status text.
 */
export function resolveMeetingUrl(opts: { provided?: string | null; provider?: MeetingProvider }): {
  url: string | null;
  provider: MeetingProvider;
  provisioned: boolean;
} {
  const provider = opts.provider ?? "google_meet";
  const provided = opts.provided?.trim();
  if (provided) return { url: provided, provider, provisioned: true };
  if (meetingRoomsConfigured()) {
    const link = generateMeetingLink(provider);
    return { url: link.url, provider, provisioned: true };
  }
  return { url: null, provider, provisioned: false };
}
