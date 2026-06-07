import { prisma } from "@/lib/db";
import { completeJson, aiEnabled, MODEL_FAST } from "@/lib/ai/anthropic";
import type { Prisma } from "@prisma/client";

// Job Intelligence extractor (Mission 10 Phase 3). Cached AI understanding of a
// role used by AI matching. Deterministic fallback derives must/nice-to-have from
// the structured job skills so it is always populated.

const SYSTEM = `You are a senior recruiter analysing a job. From the role + skills infer the hiring intent.
Return ONLY JSON: {"must_have":[string],"nice_to_have":[string],"inferred_industries":[string],"culture_signals":[string],"seniority_signal":string,"summary":string}
Be concise and evidence-based; omit/empty when unknown.`;

interface LlmJobIntel { must_have?: string[]; nice_to_have?: string[]; inferred_industries?: string[]; culture_signals?: string[]; seniority_signal?: string; summary?: string }

export async function upsertJobIntelligence(jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { skills: { include: { skill: true } } } });
  if (!job) return false;

  const mustHave = job.skills.filter((s) => s.required).map((s) => s.skill.canonicalName);
  const niceToHave = job.skills.filter((s) => !s.required).map((s) => s.skill.canonicalName);

  let data = {
    mustHave: mustHave as Prisma.InputJsonValue,
    niceToHave: niceToHave as Prisma.InputJsonValue,
    inferredIndustries: [] as Prisma.InputJsonValue,
    cultureSignals: [] as Prisma.InputJsonValue,
    senioritySignal: job.seniority as string | null,
    summary: null as string | null,
    source: "deterministic" as string,
    modelVersion: null as string | null,
    raw: {} as Prisma.InputJsonValue,
  };

  if (aiEnabled) {
    try {
      const desc = {
        title: job.title, seniority: job.seniority, mustHave, niceToHave,
        budget: job.budgetMax, english: job.englishLevel, workMode: job.workMode, employmentType: job.employmentType,
        description: job.descriptionRaw?.slice(0, 4000) ?? null,
      };
      const llm = await completeJson<LlmJobIntel>({ model: MODEL_FAST, system: SYSTEM, user: JSON.stringify(desc), maxTokens: 700 });
      if (llm) {
        data = {
          ...data,
          mustHave: (llm.must_have?.length ? llm.must_have : mustHave) as Prisma.InputJsonValue,
          niceToHave: (llm.nice_to_have?.length ? llm.nice_to_have : niceToHave) as Prisma.InputJsonValue,
          inferredIndustries: (llm.inferred_industries ?? []) as Prisma.InputJsonValue,
          cultureSignals: (llm.culture_signals ?? []) as Prisma.InputJsonValue,
          senioritySignal: llm.seniority_signal ?? job.seniority,
          summary: llm.summary ?? null,
          source: "ai",
          modelVersion: MODEL_FAST,
          raw: llm as Prisma.InputJsonValue,
        };
      }
    } catch (e) {
      console.error("job intelligence AI failed, using deterministic:", (e as Error).message);
    }
  }

  await prisma.jobIntelligence.upsert({
    where: { jobId },
    create: { jobId, ...data } as Prisma.JobIntelligenceUncheckedCreateInput,
    update: data as Prisma.JobIntelligenceUncheckedUpdateInput,
  });
  return true;
}
