import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

// Meeting-intelligence provider abstraction (Mission 4 Part 4). TimeOS/Timeless
// is NOT hardcoded into the app — everything goes through MeetingIntelligenceProvider.
// A mock provider is the default; a TimeOS provider is interface-ready and only
// activates when a key is present. No real keys required.

export interface MeetingParticipant {
  name?: string;
  email?: string;
}

export interface MeetingSummary {
  meetingId: string;
  tag?: string | null;
  recordingUrl?: string | null;
  transcript?: string | null;
  summary?: string | null;
  actionItems?: string[];
  participants?: MeetingParticipant[];
  meetingTime?: string | null; // ISO
}

export interface MeetingIntelligenceProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Generate a tag ANVI attaches to a scheduled meeting so it can be matched back. */
  createMeetingTag(seed: string): string;
  /** Match an incoming meeting to a candidate's interview (by tag, then participant email). */
  resolveMeetingToCandidate(summary: MeetingSummary): Promise<{ interviewId: string; candidateId: string } | null>;
  /** Parse a provider webhook payload into a normalized MeetingSummary. */
  handleSummaryReadyWebhook(payload: unknown): MeetingSummary | null;
  /** Pull a summary by id (fallback when webhooks aren't available). */
  fetchMeetingSummary(meetingId: string): Promise<MeetingSummary | null>;
}

export function createMeetingTag(seed: string): string {
  return `anvi-${seed.slice(0, 10)}`;
}

/** Shared resolver (DB): match a meeting to an interview by tag, then by participant email. */
export async function resolveMeeting(summary: MeetingSummary): Promise<{ interviewId: string; candidateId: string } | null> {
  // 1. Exact tag match (set by ANVI at scheduling time).
  if (summary.tag) {
    const byTag = await prisma.interview.findUnique({ where: { meetingTag: summary.tag } });
    if (byTag) return { interviewId: byTag.id, candidateId: byTag.candidateId };
  }
  // 2. Already-ingested meeting id.
  const byMeeting = await prisma.interview.findUnique({ where: { timelessMeetingId: summary.meetingId } }).catch(() => null);
  if (byMeeting) return { interviewId: byMeeting.id, candidateId: byMeeting.candidateId };
  // 3. Participant email → candidate → their most recent scheduled interview.
  for (const p of summary.participants ?? []) {
    if (!p.email) continue;
    const cand = await prisma.candidate.findFirst({ where: { email: { equals: p.email, mode: "insensitive" } } });
    if (!cand) continue;
    const iv = await prisma.interview.findFirst({ where: { candidateId: cand.id }, orderBy: { scheduledFor: "desc" } });
    if (iv) return { interviewId: iv.id, candidateId: cand.id };
  }
  return null;
}

export function parseTimeOsSummary(payload: unknown): MeetingSummary | null {
  const p = payload as Record<string, unknown>;
  const data = ((p?.data as Record<string, unknown>) ?? p) as Record<string, unknown>;
  const meetingId = String(data.meeting_id ?? data.meetingId ?? data.id ?? "");
  if (!meetingId) return null;
  return {
    meetingId,
    tag: (data.tag as string) ?? (data.meeting_tag as string) ?? null,
    recordingUrl: (data.recording_url as string) ?? (data.recordingUrl as string) ?? null,
    transcript: (data.transcript as string) ?? null,
    summary: (data.summary as string) ?? null,
    actionItems: (data.action_items as string[]) ?? (data.actionItems as string[]) ?? [],
    participants: (data.participants as MeetingParticipant[]) ?? [],
    meetingTime: (data.meeting_time as string) ?? (data.meetingTime as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
export class MockMeetingProvider implements MeetingIntelligenceProvider {
  readonly name = "mock";
  isConfigured() {
    return true;
  }
  createMeetingTag(seed: string) {
    return createMeetingTag(seed || randomUUID());
  }
  resolveMeetingToCandidate(summary: MeetingSummary) {
    return resolveMeeting(summary);
  }
  handleSummaryReadyWebhook(payload: unknown) {
    return parseTimeOsSummary(payload);
  }
  async fetchMeetingSummary(): Promise<MeetingSummary | null> {
    return null; // no remote source in mock mode
  }
}

export class TimeOsProvider implements MeetingIntelligenceProvider {
  readonly name = "timeos";
  private key = process.env.TIMEOS_API_KEY!.trim();
  private base = process.env.TIMEOS_API_BASE?.trim() || "https://api.timeless.day";
  isConfigured() {
    return Boolean(this.key);
  }
  createMeetingTag(seed: string) {
    return createMeetingTag(seed || randomUUID());
  }
  resolveMeetingToCandidate(summary: MeetingSummary) {
    return resolveMeeting(summary);
  }
  handleSummaryReadyWebhook(payload: unknown) {
    return parseTimeOsSummary(payload);
  }
  async fetchMeetingSummary(meetingId: string): Promise<MeetingSummary | null> {
    try {
      const res = await fetch(`${this.base}/v1/meetings/${meetingId}`, { headers: { Authorization: `Bearer ${this.key}` } });
      if (!res.ok) return null;
      return parseTimeOsSummary(await res.json());
    } catch {
      return null;
    }
  }
}

let cached: MeetingIntelligenceProvider | null = null;
export function getMeetingProvider(): MeetingIntelligenceProvider {
  if (cached) return cached;
  cached = process.env.TIMEOS_API_KEY?.trim() ? new TimeOsProvider() : new MockMeetingProvider();
  return cached;
}
export function resetMeetingProvider(): void {
  cached = null;
}
export function meetingsConfigured(): boolean {
  return Boolean(process.env.TIMEOS_API_KEY?.trim());
}
