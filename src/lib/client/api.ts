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
  | "explain" | "availability" | "summary" | "comparison" | "submit_result" | "share_result" | "pending"
  | "job_intake" | "job_created";

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
  chat: (message: string, context?: { jobId?: string; pendingJob?: unknown }) =>
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
  workspace: (jobId: string) => getJson<JobWorkspace>(`/api/jobs/${jobId}/workspace`),
  suggestions: (jobId: string) => getJson<{ suggestions: JobSuggestion[] }>(`/api/jobs/${jobId}/suggestions`),
  candidates: () => getJson<{ candidates: TalentItem[] }>("/api/candidates"),
  clients: () => getJson<{ clients: ClientListItem[] }>("/api/clients"),
  candidate: (id: string, jobId?: string) =>
    getJson<CandidateDetail>(`/api/candidates/${id}${jobId ? `?jobId=${jobId}` : ""}`),

  // Lazy, AI-backed CV writing/spelling analysis (Insights panel).
  candidateWriting: (id: string) =>
    getJson<{ available: boolean; reason?: string; writing: WritingQuality | null }>(`/api/candidates/${id}/writing`),

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

  // --- PDF CV import (bulk upload) ---
  importPdf: async (files: File[], source?: string): Promise<PdfImportResult> => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (source) fd.append("source", source);
    const res = await fetch("/api/candidates/import-pdf", { method: "POST", body: fd });
    if (!res.ok) throw new Error(`import-pdf -> ${res.status}`);
    return res.json();
  },

  // --- CRUD (Mission 5.1 P1) ---
  editCandidate: (id: string, body: Record<string, unknown>) => send<{ ok?: boolean; error?: string }>("PATCH", `/api/candidates/${id}`, body),
  deleteCandidate: (id: string) => send<{ ok?: boolean }>("DELETE", `/api/candidates/${id}`),
  archiveCandidate: (id: string) => send<{ ok?: boolean }>("POST", `/api/candidates/${id}/archive`, {}),
  restoreCandidate: (id: string) => send<{ ok?: boolean }>("POST", `/api/candidates/${id}/restore`, {}),
  editNote: (id: string, body: Record<string, unknown>) => send<{ ok?: boolean }>("PATCH", `/api/notes/${id}`, body),
  deleteNote: (id: string) => send<{ ok?: boolean }>("DELETE", `/api/notes/${id}`),

  // --- Scheduling (Mission 5.1 P3 / Mission 8 Phase 2) ---
  scheduleInterview: (
    candidateId: string,
    jobId: string,
    opts: { scheduledFor?: string; proposedSlots?: string[]; timezone?: string; durationMins?: number; meetingProvider?: string; meetingUrl?: string }
  ) =>
    postJson<{ interviewId?: string; status?: string; meetingTag?: string; meetingUrl?: string | null; meetingProvisioned?: boolean; reminders?: string[]; proposedSlots?: string[]; error?: string }>(
      "/api/interviews/schedule",
      { candidateId, jobId, ...opts }
    ),
  rescheduleInterview: (id: string, scheduledFor: string, meetingUrl?: string) =>
    send<{ ok?: boolean; reminders?: string[] }>("PATCH", `/api/interviews/${id}`, { scheduledFor, ...(meetingUrl ? { meetingUrl } : {}) }),
  cancelInterview: (id: string, reason?: string) => send<{ ok?: boolean }>("DELETE", `/api/interviews/${id}`, { reason }),

  // --- Candidate self-service link (Mission 8 Phase 3) ---
  createCandidateAccess: (id: string, jobId?: string) =>
    send<{ token?: string; url?: string; error?: string }>("POST", `/api/candidates/${id}/access`, jobId ? { jobId } : {}),

  whatsappMessages: (candidateId?: string) =>
    getJson<{ messages: WaMessageItem[] }>(`/api/whatsapp/messages${candidateId ? `?candidateId=${candidateId}` : ""}`),

  // --- Offers + placements (close the funnel, spec §8) ---
  offers: (params: { jobId?: string; candidateId?: string; status?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    const q = qs.toString();
    return getJson<{ offers: OfferItem[] }>(`/api/offers${q ? `?${q}` : ""}`);
  },
  createOffer: (body: { candidateId: string; jobId: string; clientRate?: number; salary?: number; startDate?: string; notes?: string }) =>
    send<{ offer?: { id: string; status: string }; error?: string; code?: string }>("POST", "/api/offers", body),
  updateOffer: (id: string, body: { status: string; startDate?: string; declineReason?: string }) =>
    send<{ offer?: { id: string; status: string }; placementId?: string | null; error?: string; code?: string }>("PATCH", `/api/offers/${id}`, body),

  placements: (params: { clientId?: string; status?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    const q = qs.toString();
    return getJson<{ placements: PlacementItem[] }>(`/api/placements${q ? `?${q}` : ""}`);
  },
  updatePlacement: (id: string, body: Record<string, unknown>) =>
    send<{ placement?: PlacementItem; error?: string }>("PATCH", `/api/placements/${id}`, body),
};

export interface OfferItem {
  id: string;
  status: "draft" | "sent" | "accepted" | "declined" | "withdrawn";
  clientRate: number | null;
  salary: number | null;
  currency: string;
  startDate: string | null;
  expiresAt: string | null;
  notes: string | null;
  declineReason: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  candidate: { id: string; name: string; title: string | null; country: string | null } | null;
  job: { id: string; title: string } | null;
  client: { id: string; name: string; company: string | null } | null;
}

export interface PlacementItem {
  id: string;
  status: "active" | "ended" | "paused";
  onboardingStatus: "pending" | "in_progress" | "complete";
  title: string | null;
  clientRate: number | null;
  currency?: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt?: string;
  candidate: { id: string; name: string; title: string | null; country: string | null; flag: string | null } | null;
  client: { id: string; name: string; company: string | null } | null;
  job: { id: string; title: string } | null;
  offerId?: string | null;
}

export interface StabilityResult {
  score: number | null;
  band: "stable" | "moderate" | "job_hopper" | "insufficient";
  avgTenureMonths: number | null;
  shortStints: number;
  roles: number;
  reasons: string[];
}

export interface WritingQuality {
  issues: number;
  examples: { wrong: string; suggestion: string }[];
  assessment: string;
  band: "clean" | "minor" | "poor";
}

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

export interface PdfImportResult {
  created: number;
  duplicates: number;
  errors: number;
  total: number;
  results: { file: string; status: "created" | "duplicate" | "error"; id?: string; name?: string | null; skills?: number; error?: string; nameConfidence?: "high" | "low" | "none" }[];
}

export interface JobSuggestion {
  type: string;
  severity: "info" | "warn" | "action";
  text: string;
  action?: string;
}

export interface WorkspaceCandidate {
  id: string;
  name: string;
  country: string | null;
  flag: string | null;
  clientRate: number | null;
  matchScore: number;
  recommendation: string;
  availabilityScore: number;
  availabilityBand: string;
  updatedAt: string;
  strengths: string[];
  risks: string[];
  anomalies: string[];
  skills: string[];
}

export interface JobWorkspace {
  overview: {
    id: string; title: string; seniority: string | null; status: string;
    client: { id: string; name: string; company: string | null } | null;
    budgetMin: number | null; budgetMax: number | null; budgetUnit: string | null;
    englishLevel: string | null; experienceYearsMin: number | null;
    workMode: string | null; employmentType: string | null; createdAt: string;
    skills: { name: string; required: boolean }[];
  };
  counts: { matching: number; submitted: number; interviewed: number; approved: number; hired: number; inPipeline: number };
  pipeline: Record<string, number>;
  topCandidates: WorkspaceCandidate[];
  clientActivity: {
    lastAction: { type: string; candidate?: string; at: string } | null;
    pendingApprovals: number;
    shares: { token: string; label: string | null; revoked: boolean; views: number; lastViewedAt: string | null; url: string }[];
  };
  interviews: { id: string; candidate?: string; status: string; scheduledFor: string | null; completedAt: string | null; summary: string | null; recordingUrl: string | null; outcome: string | null; meetingUrl: string | null }[];
  offers: { id: string; candidateId: string; candidate?: string; status: OfferItem["status"]; clientRate: number | null; startDate: string | null; createdAt: string }[];
  notes: { id: string; candidate?: string; kind: string; body: string; internal: boolean; createdAt: string }[];
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
  stability?: StabilityResult;
  notableEmployers?: { company: string; matched: string }[];
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
