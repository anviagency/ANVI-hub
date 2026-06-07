import { prisma } from "@/lib/db";
import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";
import { toCandidateInput } from "@/lib/matching/funnel";
import { scoreStability } from "@/lib/matching/insights";
import type { Prisma } from "@prisma/client";

// Candidate Intelligence extractor (Mission 10 Phase 2). AI-primary: the LLM reads
// the CV + structured facts and produces a rich, typed intelligence object. A
// deterministic fallback always runs first so even with no AI we store a usable
// (sparse, low-confidence) object — and the employment numerics (stability/tenure)
// are ALWAYS taken from the deterministic engine (trustworthy facts), never the LLM.

const candidateInclude = { skills: { include: { skill: true } }, employments: true } satisfies Prisma.CandidateDefaultArgs["include"];

// Coarse skill categorisation for the deterministic fallback (no AI needed).
const CATEGORY: Record<string, string[]> = {
  languages: ["python", "javascript", "typescript", "java", "go", "c#", "c++", "ruby", "php", "rust", "kotlin", "swift", "scala"],
  frameworks: ["react", "next.js", "node.js", "express", "django", "fastapi", "spring", "vue", "angular", "rails", ".net", "nestjs"],
  databases: ["postgresql", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb", "snowflake", "cassandra", "sqlite"],
  cloudProviders: ["aws", "gcp", "google cloud", "azure"],
  devopsTools: ["docker", "kubernetes", "terraform", "jenkins", "github actions", "ansible", "helm"],
  aimlTools: ["pytorch", "tensorflow", "langchain", "llm", "rag", "hugging face", "scikit-learn"],
};

function categorize(skillNames: { name: string; years: number }[]) {
  const out: Record<string, { name: string; years: number }[]> = { languages: [], frameworks: [], databases: [], cloudProviders: [], devopsTools: [], aimlTools: [] };
  for (const s of skillNames) {
    const lc = s.name.toLowerCase();
    for (const [cat, members] of Object.entries(CATEGORY)) {
      if (members.includes(lc)) out[cat].push({ name: s.name, years: s.years });
    }
  }
  return out;
}

export interface CandidateIntelligenceObject {
  languages: unknown[]; frameworks: unknown[]; databases: unknown[]; cloudProviders: unknown[]; devopsTools: unknown[]; aimlTools: unknown[]; architectureExp: unknown[];
  industries: unknown[]; domains: unknown[]; companySizes: unknown[]; startupExp: boolean; enterpriseExp: boolean; consultingExp: boolean;
  teamLeadership: boolean; managementYears: number | null; hiringExp: boolean; mentoringExp: boolean; maxTeamSize: number | null;
  spokenLanguages: unknown[]; writtenLanguages: unknown[]; englishConfidence: number | null; communicationConfidence: number | null;
  city: string | null; timezone: string | null; relocationWilling: boolean | null; remoteExperience: boolean;
  avgTenureMonths: number | null; stabilityScore: number | null; jobHopping: boolean; employmentGaps: unknown[];
  education: unknown[]; certifications: unknown[]; militaryExp: boolean;
  modelVersion: string | null; confidence: number | null; source: string; raw: Record<string, unknown>;
}

const SYSTEM = `You are an expert technical recruiter building a structured intelligence profile from a CV.
Extract ONLY what the CV supports. Do NOT invent facts — omit/empty/null when unknown, and lower the confidence.
Return ONLY JSON with this shape (all optional; omit unknowns):
{"frameworks":[string],"databases":[string],"cloud_providers":[string],"devops_tools":[string],"aiml_tools":[string],"architecture_exp":[string],
"industries":[string],"domains":[string],"company_sizes":[string],"startup_exp":bool,"enterprise_exp":bool,"consulting_exp":bool,
"team_leadership":bool,"management_years":number,"hiring_exp":bool,"mentoring_exp":bool,"max_team_size":number,
"spoken_languages":[{"lang":string,"level":string}],"written_languages":[{"lang":string,"level":string}],"english_confidence":number,"communication_confidence":number,
"city":string,"timezone":string,"relocation_willing":bool,"remote_experience":bool,
"education":[{"degree":string,"field":string,"institution":string,"year":number}],"certifications":[string],"military_exp":bool,
"confidence":number}`;

interface LlmIntel { [k: string]: unknown }

/** Build the intelligence object for a candidate (AI when available + deterministic facts). */
export async function buildCandidateIntelligence(candidateId: string): Promise<CandidateIntelligenceObject | null> {
  const row = await prisma.candidate.findUnique({ where: { id: candidateId }, include: candidateInclude });
  if (!row) return null;
  const input = toCandidateInput(row);
  const skillYears = row.skills.map((s) => ({ name: s.skill.canonicalName, years: s.years }));
  const cats = categorize(skillYears);

  // Deterministic facts (always trusted).
  const stab = scoreStability(input, new Date().getUTCFullYear());

  const base: CandidateIntelligenceObject = {
    languages: cats.languages, frameworks: cats.frameworks, databases: cats.databases, cloudProviders: cats.cloudProviders, devopsTools: cats.devopsTools, aimlTools: cats.aimlTools, architectureExp: [],
    industries: [], domains: [], companySizes: [], startupExp: false, enterpriseExp: false, consultingExp: false,
    teamLeadership: false, managementYears: null, hiringExp: false, mentoringExp: false, maxTeamSize: null,
    spokenLanguages: [], writtenLanguages: [], englishConfidence: englishToConfidence(row.englishLevel), communicationConfidence: null,
    city: null, timezone: null, relocationWilling: null, remoteExperience: false,
    avgTenureMonths: stab.avgTenureMonths, stabilityScore: stab.score, jobHopping: stab.band === "job_hopper", employmentGaps: [],
    education: [], certifications: [], militaryExp: false,
    modelVersion: null, confidence: 30, source: "deterministic", raw: {},
  };

  if (!aiEnabled || !row.cvText || row.cvText.trim().length < 40) return base;

  try {
    const llm = await completeJson<LlmIntel>({ model: MODEL_FAST, system: SYSTEM, user: row.cvText.slice(0, 8000), maxTokens: 1400 });
    if (!llm) return base;
    const arr = (k: string) => (Array.isArray(llm[k]) ? (llm[k] as unknown[]) : []);
    const bool = (k: string) => llm[k] === true;
    const numOrNull = (k: string) => (typeof llm[k] === "number" ? (llm[k] as number) : null);
    const strOrNull = (k: string) => (typeof llm[k] === "string" ? (llm[k] as string) : null);
    return {
      ...base,
      // AI enriches the typed lists (merge with deterministic categorisation).
      frameworks: mergeNames(base.frameworks, arr("frameworks")),
      databases: mergeNames(base.databases, arr("databases")),
      cloudProviders: mergeNames(base.cloudProviders, arr("cloud_providers")),
      devopsTools: mergeNames(base.devopsTools, arr("devops_tools")),
      aimlTools: mergeNames(base.aimlTools, arr("aiml_tools")),
      architectureExp: arr("architecture_exp"),
      industries: arr("industries"), domains: arr("domains"), companySizes: arr("company_sizes"),
      startupExp: bool("startup_exp"), enterpriseExp: bool("enterprise_exp"), consultingExp: bool("consulting_exp"),
      teamLeadership: bool("team_leadership"), managementYears: numOrNull("management_years"), hiringExp: bool("hiring_exp"), mentoringExp: bool("mentoring_exp"), maxTeamSize: numOrNull("max_team_size"),
      spokenLanguages: arr("spoken_languages"), writtenLanguages: arr("written_languages"),
      englishConfidence: numOrNull("english_confidence") ?? base.englishConfidence,
      communicationConfidence: numOrNull("communication_confidence"),
      city: strOrNull("city"), timezone: strOrNull("timezone"),
      relocationWilling: typeof llm["relocation_willing"] === "boolean" ? (llm["relocation_willing"] as boolean) : null,
      remoteExperience: bool("remote_experience"),
      education: arr("education"), certifications: arr("certifications"), militaryExp: bool("military_exp"),
      // Employment numerics ALWAYS from the deterministic engine (facts), never the LLM.
      avgTenureMonths: base.avgTenureMonths, stabilityScore: base.stabilityScore, jobHopping: base.jobHopping,
      modelVersion: MODEL_FAST, confidence: numOrNull("confidence") ?? 70, source: "hybrid", raw: llm as Record<string, unknown>,
    };
  } catch (e) {
    console.error("candidate intelligence AI failed, using deterministic:", (e as Error).message);
    return base;
  }
}

/** Build + persist (upsert) the intelligence for a candidate. */
export async function upsertCandidateIntelligence(candidateId: string): Promise<boolean> {
  const obj = await buildCandidateIntelligence(candidateId);
  if (!obj) return false;
  const data = {
    languages: obj.languages as Prisma.InputJsonValue, frameworks: obj.frameworks as Prisma.InputJsonValue, databases: obj.databases as Prisma.InputJsonValue,
    cloudProviders: obj.cloudProviders as Prisma.InputJsonValue, devopsTools: obj.devopsTools as Prisma.InputJsonValue, aimlTools: obj.aimlTools as Prisma.InputJsonValue, architectureExp: obj.architectureExp as Prisma.InputJsonValue,
    industries: obj.industries as Prisma.InputJsonValue, domains: obj.domains as Prisma.InputJsonValue, companySizes: obj.companySizes as Prisma.InputJsonValue,
    startupExp: obj.startupExp, enterpriseExp: obj.enterpriseExp, consultingExp: obj.consultingExp,
    teamLeadership: obj.teamLeadership, managementYears: obj.managementYears, hiringExp: obj.hiringExp, mentoringExp: obj.mentoringExp, maxTeamSize: obj.maxTeamSize,
    spokenLanguages: obj.spokenLanguages as Prisma.InputJsonValue, writtenLanguages: obj.writtenLanguages as Prisma.InputJsonValue, englishConfidence: obj.englishConfidence, communicationConfidence: obj.communicationConfidence,
    city: obj.city, timezone: obj.timezone, relocationWilling: obj.relocationWilling, remoteExperience: obj.remoteExperience,
    avgTenureMonths: obj.avgTenureMonths, stabilityScore: obj.stabilityScore, jobHopping: obj.jobHopping, employmentGaps: obj.employmentGaps as Prisma.InputJsonValue,
    education: obj.education as Prisma.InputJsonValue, certifications: obj.certifications as Prisma.InputJsonValue, militaryExp: obj.militaryExp,
    modelVersion: obj.modelVersion, confidence: obj.confidence, source: obj.source, raw: obj.raw as Prisma.InputJsonValue,
  };
  await prisma.candidateIntelligence.upsert({ where: { candidateId }, create: { candidateId, ...data }, update: data });
  return true;
}

function englishToConfidence(level: string | null): number | null {
  if (!level) return null;
  if (/native|fluent|c2/i.test(level)) return 95;
  if (/c1/i.test(level)) return 85;
  if (/b2\+|upper/i.test(level)) return 72;
  if (/b2/i.test(level)) return 65;
  if (/b1/i.test(level)) return 45;
  return 50;
}

function mergeNames(a: unknown[], b: unknown[]): unknown[] {
  const names = new Set<string>();
  const out: unknown[] = [];
  for (const item of [...a, ...b]) {
    const name = typeof item === "string" ? item : (item as { name?: string })?.name;
    if (!name) continue;
    const key = name.toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    out.push(item);
  }
  return out;
}
