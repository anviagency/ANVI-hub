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
  // provisioned=false: the URL is generated, not booked through the provider API yet.
  return { url, provider, provisioned: false };
}
