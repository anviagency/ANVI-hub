import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { meetingsConfigured } from "@/lib/meetings/provider";
import type { Prisma } from "@prisma/client";

// Client Package builder (Mission 10 Phase 6). Composes an anonymized, client-safe
// candidate package: summary, experience, skills, strengths, risks, interview
// summary, availability, recommendation, rate (price). NEVER includes phone, email,
// LinkedIn, internal salary/cost, internal notes, or raw transcript.

export interface PackageBranding {
  agencyName?: string;
  logoUrl?: string;
  color?: string;
}

export interface PackageItemView {
  candidateId: string;
  name: string;
  title: string | null;
  country: string | null;
  englishLevel: string | null;
  availability: string;
  availabilityNote: string | null;
  rate: number | null; // price to client (never cost)
  skills: string[];
  summary: string | null;
  recommendation: string | null;
  matchScore: number | null;
  strengths: { text: string }[];
  risks: { text: string }[];
  experience: { company: string; title: string | null; period: string }[];
  interviewSummary: string | null;
}

function period(start: Date, end: Date | null): string {
  const f = (d: Date) => `${d.getUTCFullYear()}`;
  return `${f(start)} – ${end ? f(end) : "present"}`;
}

/** Build the anonymized client-safe view for one candidate on a job. */
export async function buildPackageItem(candidateId: string, jobId: string): Promise<PackageItemView | null> {
  const c = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { skills: { include: { skill: true } }, employments: { orderBy: { startDate: "desc" } } },
  });
  if (!c) return null;
  const analysis = await prisma.candidateAnalysis.findUnique({ where: { candidateId_jobId: { candidateId, jobId } } });
  const interview = await prisma.interview.findFirst({
    where: { candidateId, jobId, status: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
  });
  // Interview summary is client-safe (it's an AI summary, not the transcript). The
  // recording link is only surfaced elsewhere when a real provider exists.
  void meetingsConfigured;

  return {
    candidateId: c.id,
    name: c.fullName,
    title: c.title,
    country: c.country,
    englishLevel: c.englishLevel,
    availability: c.availability,
    availabilityNote: c.availabilityNote,
    rate: c.clientRate, // ONLY the client price; internal salaryExpectation is never included
    skills: c.skills.map((s) => s.skill.canonicalName),
    summary: c.aiSummary,
    recommendation: analysis?.recommendation ?? null,
    matchScore: analysis?.matchScore ?? null,
    strengths: (analysis?.strengths as { text: string }[] | undefined)?.slice(0, 4).map((s) => ({ text: s.text })) ?? [],
    risks: (analysis?.risks as { text: string }[] | undefined)?.slice(0, 3).map((r) => ({ text: r.text })) ?? [],
    experience: c.employments.slice(0, 6).map((e) => ({ company: e.company, title: e.title, period: period(e.startDate, e.endDate) })),
    interviewSummary: interview?.summary ?? null,
  };
}

export interface CreatePackageInput {
  jobId: string;
  candidateIds: string[];
  branding?: PackageBranding;
  title?: string;
  createdBy?: string;
}

/** Compose + persist a client package; returns the token + url. */
export async function createClientPackage(input: CreatePackageInput): Promise<{ token: string; url: string; count: number } | null> {
  const job = await prisma.job.findUnique({ where: { id: input.jobId }, include: { client: true } });
  if (!job) return null;

  const items: PackageItemView[] = [];
  for (const cid of input.candidateIds) {
    const item = await buildPackageItem(cid, input.jobId);
    if (item) items.push(item);
  }
  if (items.length === 0) return null;

  const token = randomBytes(20).toString("base64url");
  const branding: PackageBranding = { agencyName: "ANVI", color: "#4f46e5", ...(input.branding ?? {}) };

  const pkg = await prisma.clientPackage.create({
    data: {
      token,
      jobId: input.jobId,
      clientId: job.clientId,
      title: input.title ?? `${job.title} — candidate package`,
      branding: branding as Prisma.InputJsonValue,
      createdBy: input.createdBy ?? null,
      items: { create: items.map((it, i) => ({ candidateId: it.candidateId, position: i, data: it as unknown as Prisma.InputJsonValue })) },
    },
  });
  return { token: pkg.token, url: `/package/${pkg.token}`, count: items.length };
}

export interface ResolvedPackage {
  title: string | null;
  job: { title: string };
  client: { name: string; company: string | null } | null;
  branding: PackageBranding;
  items: PackageItemView[];
}

/** Public resolve for the package page (token-authorized, read-only). */
export async function resolveClientPackage(token: string): Promise<ResolvedPackage | null> {
  const pkg = await prisma.clientPackage.findUnique({
    where: { token },
    include: { job: { include: { client: true } }, items: { orderBy: { position: "asc" } } },
  });
  if (!pkg) return null;
  return {
    title: pkg.title,
    job: { title: pkg.job.title },
    client: pkg.job.client ? { name: pkg.job.client.name, company: pkg.job.client.company } : null,
    branding: (pkg.branding as PackageBranding) ?? {},
    items: pkg.items.map((i) => i.data as unknown as PackageItemView),
  };
}
