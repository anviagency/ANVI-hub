// Browser-side API client + response types for the Recruiter Copilot UI.
import type { ParsedJob, Strength, Risk, Anomaly, FreshnessResult, ScoreComponent } from "@/lib/types";

export interface CandidateCard {
  id: string;
  name: string;
  title: string | null;
  country: string | null;
  location: string | null;
  flag: string | null;
  english: string | null;
  availability: "available" | "on_hold" | "placed";
  availabilityNote: string | null;
  clientRate: number | null;
  skills: string[];
  matchScore: number;
  recommendation: "strong" | "possible" | "weak";
  strengths: Strength[];
  risks: Risk[];
  anomalies: Anomaly[];
  freshness?: FreshnessResult;
  scoreBreakdown?: ScoreComponent[];
}

export type ChatKind =
  | "job_preview" | "candidates" | "status" | "fallback"
  | "explain" | "availability" | "summary" | "comparison" | "submit_result" | "share_result" | "pending";

export interface ChatResponse {
  intent: string;
  thinking: string[];
  reply: string;
  kind: ChatKind;
  // Data is intentionally broad — each kind populates a subset (rendered by ResponseBody).
  data: Record<string, unknown> & {
    parsed?: ParsedJob;
    aiBacked?: boolean;
    jobId?: string;
    jobTitle?: string;
    list?: CandidateCard[];
    jobs?: { id: string; title: string; client: string; analyzed: number; submitted: number }[];
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({})) as Promise<T>;
}

export const api = {
  chat: (message: string, context?: { jobId?: string }) =>
    postJson<ChatResponse>("/api/chat", { message, context }),

  resolveClient: (name: string) =>
    postJson<{ found: boolean; client?: { id: string; name: string; company: string | null }; suggestedName?: string }>(
      "/api/clients/resolve",
      { name }
    ),

  createClient: (name: string) =>
    postJson<{ client: { id: string; name: string; company: string | null } }>("/api/clients", { name }),

  createJob: (job: {
    clientId?: string;
    title: string;
    seniority: string | null;
    experienceYearsMin: number | null;
    englishLevel: string | null;
    budget: { min: number | null; max: number | null; unit: string | null };
    skills: { name: string; required: boolean; minYears: number | null }[];
    descriptionRaw?: string;
  }) => postJson<{ job: { id: string; title: string } }>("/api/jobs", job),

  jobs: () => getJson<{ jobs: JobListItem[] }>("/api/jobs"),
  candidates: () => getJson<{ candidates: TalentItem[] }>("/api/candidates"),
  clients: () => getJson<{ clients: ClientListItem[] }>("/api/clients"),
  candidate: (id: string, jobId?: string) =>
    getJson<CandidateDetail>(`/api/candidates/${id}${jobId ? `?jobId=${jobId}` : ""}`),

  addNote: (id: string, body: { body: string; kind?: string; internal?: boolean; jobId?: string }) =>
    postJson<{ note: { id: string } }>(`/api/candidates/${id}/notes`, body),

  // Import
  importPreview: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/import/preview", { method: "POST", body: fd }).then((r) => r.json()) as Promise<ImportPreview>;
  },
  importCommit: (file: File, mapping: Record<string, string>, source?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    if (source) fd.append("source", source);
    return fetch("/api/import/commit", { method: "POST", body: fd }).then((r) => r.json()) as Promise<{
      taskId?: string;
      rows?: number;
      status?: string;
      error?: string;
    }>;
  },
  importStatus: (taskId: string) =>
    fetch(`/api/import/status/${taskId}`).then((r) => r.json()) as Promise<{
      status: string;
      summary: ImportSummary | null;
      error?: string | null;
    }>,

  // Pipeline
  pipeline: (params: Record<string, string>) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return getJson<{ stages: string[]; entries: PipelineEntry[] }>(`/api/pipeline?${qs.toString()}`);
  },
  movePipeline: (body: { candidateId: string; jobId: string; stage: string; feedback?: string }) =>
    postJson<{ result?: { from: string; to: string }; error?: string }>("/api/pipeline", body),

  // Share
  createShare: (jobId: string, candidates: { candidateId: string; shareNotes?: boolean }[], label?: string) =>
    postJson<{ token: string; url: string }>(`/api/jobs/${jobId}/share`, { candidates, label }),
  jobShares: (jobId: string) =>
    getJson<{ links: { token: string; label: string | null; candidates: number; url: string; revoked: boolean }[] }>(
      `/api/jobs/${jobId}/share`
    ),

  notifications: () =>
    getJson<{ notifications: { id: string; channel: string; status: string; title: string; body: string; createdAt: string }[] }>(
      "/api/notifications"
    ),

  // --- Single candidate intake (Mission 5.1 P2) ---
  createCandidate: (body: Record<string, unknown>) =>
    send<{ id?: string; duplicate?: boolean; error?: string; message?: string }>("POST", "/api/candidates", body),

  // --- CRUD (Mission 5.1 P1) ---
  editCandidate: (id: string, body: Record<string, unknown>) => send<{ ok?: boolean; error?: string }>("PATCH", `/api/candidates/${id}`, body),
  deleteCandidate: (id: string) => send<{ ok?: boolean }>("DELETE", `/api/candidates/${id}`),
  archiveCandidate: (id: string) => send<{ ok?: boolean }>("POST", `/api/candidates/${id}/archive`, {}),
  restoreCandidate: (id: string) => send<{ ok?: boolean }>("POST", `/api/candidates/${id}/restore`, {}),
  editNote: (id: string, body: Record<string, unknown>) => send<{ ok?: boolean }>("PATCH", `/api/notes/${id}`, body),
  deleteNote: (id: string) => send<{ ok?: boolean }>("DELETE", `/api/notes/${id}`),

  // --- Scheduling (Mission 5.1 P3) ---
  scheduleInterview: (candidateId: string, jobId: string, scheduledFor: string, meetingProvider = "google_meet") =>
    postJson<{ interviewId?: string; meetingTag?: string; meetingUrl?: string; reminders?: string[]; error?: string }>("/api/interviews/schedule", {
      candidateId,
      jobId,
      scheduledFor,
      meetingProvider,
    }),
  rescheduleInterview: (id: string, scheduledFor: string) => send<{ ok?: boolean; reminders?: string[] }>("PATCH", `/api/interviews/${id}`, { scheduledFor }),
  cancelInterview: (id: string, reason?: string) => send<{ ok?: boolean }>("DELETE", `/api/interviews/${id}`, { reason }),

  whatsappMessages: (candidateId?: string) =>
    getJson<{ messages: WaMessageItem[] }>(`/api/whatsapp/messages${candidateId ? `?candidateId=${candidateId}` : ""}`),
};

export interface WaMessageItem {
  id: string;
  direction: string;
  kind: string;
  status: string;
  event: string | null;
  toNumber: string | null;
  fromNumber: string | null;
  body: string | null;
  createdAt: string;
}

export interface ImportPreview {
  filename?: string;
  columns?: string[];
  sample?: Record<string, string>[];
  rowCount?: number;
  suggestedMapping?: Record<string, string>;
  fields?: { key: string; label: string; required?: boolean }[];
  error?: string;
}

export interface ImportSummary {
  batchId: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  rows: { fullName: string; action: string; reason?: string }[];
}

export interface PipelineEntry {
  id: string;
  stage: string;
  enteredStageAt: string;
  job: { id: string; title: string };
  candidate: {
    id: string;
    name: string;
    title: string | null;
    country: string | null;
    flag: string | null;
    english: string | null;
    availability: string;
    clientRate: number | null;
    skills: string[];
  };
}

export interface JobListItem {
  id: string;
  title: string;
  seniority: string | null;
  status: string;
  budgetMin: number | null;
  budgetMax: number | null;
  englishLevel: string | null;
  experienceYearsMin: number | null;
  client: { id: string; name: string; company: string | null } | null;
  skills: { name: string; required: boolean }[];
  analyzed: number;
  submitted: number;
}

export interface TalentItem {
  id: string;
  name: string;
  title: string | null;
  country: string | null;
  location: string | null;
  flag: string | null;
  english: string | null;
  totalYears: number | null;
  availability: "available" | "on_hold" | "placed";
  availabilityNote: string | null;
  clientRate: number | null;
  source: string | null;
  updatedAt: string;
  skills: string[];
}

export interface ClientListItem {
  id: string;
  name: string;
  company: string | null;
  initials: string | null;
  country: string | null;
  portalSlug: string;
  jobs: number;
  placements: number;
}

export interface CandidateDetail {
  candidate: {
    id: string;
    name: string;
    title: string | null;
    country: string | null;
    location: string | null;
    flag: string | null;
    english: string | null;
    totalYears: number | null;
    availability: string;
    availabilityNote: string | null;
    clientRate: number | null;
    salaryExpectation: number | null;
    source: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    archived?: boolean;
    aiSummary: string | null;
    linkedinTitle: string | null;
    createdAt: string;
    updatedAt: string;
    lastContactedAt: string | null;
    lastScreenedAt: string | null;
    skills: { name: string; years: number }[];
    employments: { company: string; title: string | null; fullTime: boolean; startDate: string; endDate: string | null }[];
  };
  anomalies: Anomaly[];
  freshness?: FreshnessResult;
  availabilityScore?: { score: number; band: string; reasons: string[] };
  communicationHealth?: { band: "green" | "yellow" | "red"; daysSinceContact: number | null };
  analysis: {
    matchScore: number;
    recommendation: string;
    strengths: Strength[];
    risks: Risk[];
    freshness?: FreshnessResult;
    scoreBreakdown?: ScoreComponent[];
  } | null;
  notes: { id: string; kind: string; body: string; internal: boolean; author: string | null; createdAt: string }[];
  pipelines: { jobId: string; jobTitle: string; client: string | null; stage: string; enteredStageAt: string }[];
  interviews: {
    id: string;
    summary: string | null;
    recordingUrl: string | null;
    transcriptAvailable?: boolean;
    actionItems?: unknown;
    participants?: unknown;
    provider?: string | null;
    meetingTag?: string | null;
    meetingTime?: string | null;
    meetingUrl?: string | null;
    meetingProvider?: string | null;
    timezone?: string | null;
    durationMins?: number | null;
    status?: string;
    webhookStatus?: string;
    scheduledFor: string | null;
    completedAt: string | null;
    outcome: string | null;
  }[];
  timeline: { type: string; actor: string; meta: unknown; createdAt: string }[];
}
