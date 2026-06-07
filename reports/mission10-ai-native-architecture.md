# Mission 10 — AI-Native Recruitment Engine: Architecture & Design

Status: **DESIGN ONLY. No code changed.** This document is the blueprint for turning
ANVI from "recruitment system with AI features" into an "AI recruitment operating
system," **without destroying the working system.**

Guiding principle (the one correction to the brief): **AI-primary with a
deterministic safety net** — the AI understands, decides, and reasons; deterministic
code executes safely, verifies facts, and guards money/PII. "100% AI" in the *decision*
layer; never 100% AI in the *execution/verification* layer (that would trade away
explainability, cost control, and the trustworthy anomaly engine we already have).

Reused, kept intact: Postgres + Prisma, the background queue/worker (`background_job`),
the provider abstraction (`completeJson` over Gemini/Anthropic), the Stage-1 SQL fast
filter (`funnel.ts`), the deterministic anomaly engine (`anomaly.ts`), the client-safe
share projection (`share.ts`), audit log, and all existing handlers (they become
**tools**, not dead code).

---

## Deliverable 1 — Gap analysis (summary; full detail in `reports/ai-native-gap-review.md`)

| Area | Today | Target |
|---|---|---|
| Decision layer | regex `routeIntentDeterministic` first; LLM is fallback (`intent-router.ts:114`) | AI understanding/decision first; deterministic executes |
| Dispatch | `switch(intent)` over 13 handlers (`chat/route.ts:50`) | AI plans typed **tool calls** |
| Matching | SQL overlap + fixed arithmetic formula; **no LLM** (`funnel.ts`,`scoring.ts`) | 4-stage AI matching with cached understanding |
| Candidate | flat parsed CV (name/contact/skills/years) | structured Candidate Intelligence object |
| Client memory | none (raw decisions only) | learned preferences + approval probability |
| Similarity | none (`find_similar` wrongly matches a job) | first-class embedding similarity |
| Client package | none | one-click anonymized branded PDF |
| Intake | regex slot-machine + menu buttons (`intake.ts`) | AI fills only true gaps, acts when confident |

---

## Deliverable 2 — Architecture plan: the agent loop

Replace `regex → switch → handler` with an **agentic orchestration loop**. The LLM is
the orchestrator; existing handlers become **tools** behind a typed registry.

```
Recruiter message + conversation state
        │
        ▼
[1] AI Understanding Layer  (LLM)
     → { interpretation, entities, ambiguities }
        │
        ▼
[2] AI Decision Layer  (LLM, tool-aware)
     → plan: ordered tool calls  OR  a question (only for genuinely missing info)
        │
        ▼
[3] Guardrail + Validation  (deterministic)
     → validate tool args (Zod), auth/role, money/PII rules, transition legality
        │
        ▼
[4] Execution  (deterministic tools = today's handlers)
     → createJob, resolveClient, searchCandidates, runMatch, submit,
       generatePackage, scheduleInterview, … (each audited, idempotent)
        │
        ▼
[5] AI Follow-Up  (LLM)
     → natural reply + proactive next-step proposal ("…want a client package?")
```

### Key components (new)
- `src/lib/agent/orchestrator.ts` — the loop above; runs Understanding→Decision→Execute→Follow-up, supports multi-step (a plan may call several tools).
- `src/lib/agent/tools/registry.ts` — a `Tool` = `{ name, description, paramsSchema (Zod→JSON schema), run(args, ctx), confirms?: boolean }`. **Every existing handler is registered as a tool** (no logic rewrite): `create_job` (wraps `intake.finalize`), `search_candidates` (wraps `handleSearchCandidates`), `match_for_job` (wraps `runMatch`), `submit_candidates`, `share_link`, `compare`, `summarize`, `schedule_interview`, `pending_actions`, plus **new** tools: `find_similar`, `client_package`, `who_would_client_approve`, `safest_candidate`, `build_shortlist`.
- Tool-calling transport: Gemini **function calling** (`tools`/`functionDeclarations` in `generateContent`) when available; else a structured-JSON plan (`completeJson` returning `{ message, tool_calls:[{name,args}], ask?:string }`). Extend `src/lib/ai/anthropic.ts` with a `completeTools()` that abstracts both, mirroring the existing `completeJson` pattern.
- Confidence policy (Decision layer): tools marked `confirms:true` (money/PII/irreversible — submit, share, package) require a one-tap confirm; everything safe and reversible the AI may execute immediately ("act when confident"). Threshold + the confirm list live in `agent/policy.ts`.

### Why this preserves the working system
The handlers already do the real work and are tested. Wrapping them as tools means the
deterministic execution path is unchanged and auditable; only the **routing brain**
changes from regex/switch to AI planning. The regex router survives as an **optional
fast-path/cost-saver** for trivially unambiguous messages and as a guardrail oracle,
not as the primary decision-maker.

---

## Deliverable 3 — Data model changes (Prisma; additive, no destructive drops)

All changes are **additive** (new tables / nullable columns), preserving existing
`Candidate`, `Job`, `CandidateAnalysis`, `Submission`, etc. Migrations via the
established `migrate diff → migrate deploy` flow.

New models:
- `CandidateIntelligence` (1:1 with Candidate) — Deliverable 4.
- `JobIntelligence` (1:1 with Job) — AI job understanding (parsed + inferred requirements, nice-to-haves, seniority signals, culture signals).
- `ClientInsight` (1:1 with Client) — Deliverable 5 (learned preferences + budget ceiling + trait weights).
- `CandidateVector` (1:1 with Candidate) — embedding for similarity (Deliverable 7).
- `ClientPackage` (+ `ClientPackageItem`) — generated packages (Deliverable 8).

Extend `CandidateAnalysis` (additive JSON/scalar columns): `approvalProbability Float?`,
`retentionProbability Float?`, `fitBreakdown Json?` (technical/industry/culture/leadership/
communication/availability/budget sub-scores), `reasoning String?`, `engineVersion String?`,
`source String?` ("deterministic" | "ai" | "hybrid").

Add `CandidateEvent` types already cover decisions; add `placement_outcome` (for
"successful hire" similarity training signal) and `package_generated`.

---

## Deliverable 4 — Candidate Intelligence model

A structured object, generated by the AI **at intake** (and re-generated on CV edit),
stored once, and **reused by matching** — NOT recomputed per match. This is the key to
making Stage-4 AI matching affordable.

```prisma
model CandidateIntelligence {
  candidateId String @id @map("candidate_id")
  // Technical
  languages        Json @default("[]") // [{name, years, level}]
  frameworks       Json @default("[]")
  databases        Json @default("[]")
  cloudProviders   Json @default("[]")
  devopsTools      Json @default("[]")
  aimlTools        Json @default("[]")
  architectureExp  Json @default("[]") // ["microservices","event-driven",…]
  // Business
  industries       Json @default("[]")
  domains          Json @default("[]")
  companySizes     Json @default("[]") // ["startup","scaleup","enterprise"]
  startupExp       Boolean @default(false)
  enterpriseExp    Boolean @default(false)
  consultingExp    Boolean @default(false)
  // Leadership
  teamLeadership   Boolean @default(false)
  managementYears  Float?
  hiringExp        Boolean @default(false)
  mentoringExp     Boolean @default(false)
  maxTeamSize      Int?
  // Communication
  spokenLanguages  Json @default("[]") // [{lang, level}]
  writtenLanguages Json @default("[]")
  englishConfidence    Int? // 0-100
  communicationConfidence Int? // 0-100
  // Geography
  city             String?
  timezone         String?
  relocationWilling Boolean?
  remoteExperience Boolean @default(false)
  // Employment (mirrors insights.ts, now persisted)
  avgTenureMonths  Int?
  stabilityScore   Int?  // 0-100
  jobHopping       Boolean @default(false)
  employmentGaps   Json @default("[]")
  // Education
  education        Json @default("[]") // [{degree, field, institution, year}]
  certifications   Json @default("[]")
  militaryExp      Boolean @default(false)
  // provenance
  modelVersion String?
  confidence   Int?  // 0-100 extraction confidence
  generatedAt  DateTime @default(now())
  raw          Json @default("{}") // full AI output for audit
  candidate Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  @@map("candidate_intelligence")
}
```

- Generated by a new AI extractor `src/lib/ai/candidate-intelligence.ts` (LLM over `cvText` + employments + existing skills), producing the typed object; deterministic post-validation (e.g., `stabilityScore` from `insights.ts`, years sanity vs `careerYears`).
- Existing `skills`/`employments` stay as the **source of truth for facts**; intelligence is the **inferred, structured layer** on top. Anomaly engine continues to fact-check against `skills`/`employments`.
- Backfill: a worker job `backfill_candidate_intelligence` runs over existing candidates (Deliverable 10).

---

## Deliverable 5 — Client Memory model

Learn each client's decision patterns from data we **already capture** (`Submission.clientStatus`, `CandidateEvent` `client_approved`/`client_rejected`/`interview_requested`, `ClientMessage`, `clientFeedback`).

```prisma
model ClientInsight {
  clientId String @id @map("client_id")
  // Learned, human-readable preferences (AI-summarized over decisions)
  preferences  Json @default("[]") // [{text:"prefers C1+ English", weight, evidence}]
  // Quantitative signals (deterministic from decisions)
  approvedCount Int @default(0)
  rejectedCount Int @default(0)
  budgetCeilingObserved Float?   // max approved clientRate
  rejectsAboveRate     Float?    // rate above which rejections cluster
  preferredCountries   Json @default("[]")
  englishFloor         String?   // lowest English among approvals
  traitWeights         Json @default("{}") // {startup:+0.3, enterprise:-0.1, leadership:+0.2,…}
  summary      String?  // "Andy prefers strong English, startup backgrounds, ≤ $40/hr."
  updatedAt    DateTime @updatedAt
  modelVersion String?
  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@map("client_insight")
}
```

- Updater: worker job `recompute_client_insight(clientId)` enqueued on every client decision; deterministic aggregates (counts, budget ceiling, country/English floors) + an AI pass that turns the decision history into weighted, evidence-backed preferences.
- **Approval probability** per candidate = a function of `ClientInsight.traitWeights` applied to `CandidateIntelligence` + budget/English/country fit, calibrated against the client's historical approval rate. Computed in Stage-4 matching; stored on `CandidateAnalysis.approvalProbability`. Cold-start (no history): fall back to global priors + "low confidence" flag — never fabricate a confident number.

---

## Deliverable 6 — AI Matching redesign (4 stages)

```
Stage 1 — Fast filter (KEEP)           funnel.ts:stage1Filter  (SQL, 100k→~80)
Stage 2 — AI Candidate Understanding   PRECOMPUTED & CACHED (CandidateIntelligence)
Stage 3 — AI Job Understanding         PRECOMPUTED & CACHED (JobIntelligence)
Stage 4 — AI Matching (per finalist)   LLM evaluates the two intelligence objects
```

- **Cost/latency control (critical):** Stages 2 & 3 are computed **once** at intake/job-creation and cached; they are NOT re-run per match. Stage 4 runs only on the ~80 survivors, **batched** (one LLM call scoring a batch of candidates against one job), with results cached in `CandidateAnalysis` keyed by `(candidateId, jobId, candidate.updatedAt, job.updatedAt, engineVersion)` — reusing the existing freshness-cache pattern (`getFreshAnalysis`).
- **Stage 4 output (per candidate):** `matchScore`, `reasoning`, `strengths`, `risks`, `fitBreakdown` {technical, industry, culture, leadership, communication, availability, budget}, `approvalProbability` (Deliverable 5), `retentionProbability` (from `stabilityScore` + salary-growth + gaps + tenure).
- **Deterministic safety net (non-negotiable):** the existing `anomaly.ts` runs **independently** and its RED flags are merged in and can **cap** the AI score (AI cannot "explain away" an impossible-tenure or duplicate). The deterministic `scoring.ts` becomes a **verifier/fallback**: if AI is unavailable or its output fails schema/fact checks, fall back to today's formula (so the system never goes dark). Score provenance recorded in `CandidateAnalysis.source`.
- **Historical success similarity** feeds Stage 4: include "similarity to this client's previously *placed* candidates" as a signal (Deliverable 7).
- Benchmarking (spec §7.6) extends to compare AI vs deterministic scores on the seeded scenarios → guard against AI regressions before flipping the default.

---

## Deliverable 7 — Similarity engine

Embedding-based, first-class. (Gemini exposes `gemini-embedding-001` on the same key.)

```prisma
model CandidateVector {
  candidateId String @id @map("candidate_id")
  embedding   Unsupported("vector(768)")?  // pgvector; or Float[] fallback
  model       String?
  builtFrom   String?  // hash of intelligence used, for staleness
  updatedAt   DateTime @updatedAt
  @@map("candidate_vector")
}
```

- **Embeddings** built from a canonical text rendering of `CandidateIntelligence` (skills + industries + seniority + leadership + summary). Built by worker `build_candidate_vector` at intake / intelligence refresh.
- **Storage/search:** add the `pgvector` extension (one migration) for cosine top-K; if pgvector is undesirable, a deterministic fallback similarity (weighted Jaccard over skills/industries/frameworks + numeric distance on years/rate/stability) keeps the feature working without the extension.
- **Capabilities (as tools):**
  - "similar to Vasya" → resolve Vasya → cosine top-K (excluding placed).
  - "similar to the last successful hire" → resolve client's most recent `placed` candidate → top-K.
  - "cheaper alternative" → similarity top-K **re-ranked/filtered** by `clientRate <`.
  - "stronger English alternative" → top-K filtered by higher `englishConfidence`.
- This fixes the current silent bug where `find_similar` matches a job instead of a person.

---

## Deliverable 8 — Client Package generation

A tool `client_package` invoked from chat ("create a package for Andy").

```prisma
model ClientPackage {
  id        String @id @default(cuid())
  jobId     String
  clientId  String?
  title     String?
  branding  Json @default("{}")  // {logoUrl, color, agencyName}
  status    String @default("generating") // generating|ready|failed
  fileUrl   String?  // object-storage URL of the branded PDF
  createdBy String?
  createdAt DateTime @default(now())
  items     ClientPackageItem[]
  @@map("client_package")
}
model ClientPackageItem {
  id          String @id @default(cuid())
  packageId   String
  candidateId String
  anonymized  Json    // client-safe projection snapshot (no phone/email/LinkedIn/cost)
  @@map("client_package_item")
}
```

- **Composition (reuse, don't reinvent):** the client-safe per-candidate content already exists in `share.ts` (`ClientSafeCandidate` — summary, strengths, risks, client-safe interview, rate, NO cost/notes/transcript). The package composer reuses this projection and adds AI-written candidate summaries + a recommendation.
- **Anonymization:** strip phone/email/LinkedIn/exact name→initials per branding policy; the share projection already excludes cost/internal notes — extend it with a `presentation: "client_cv"` mode.
- **Rendering:** PDF generated **in the worker** (heavy, off request path) via a server PDF lib (`@react-pdf/renderer` or `pdfkit`); branded with client logo/colour; stored in object storage; `fileUrl` returned. New deps required (flag as the one place we add a dependency).
- **One-click:** chat tool → enqueues `generate_client_package` → worker renders → notifies recruiter with the link; the client portal can expose the package too.

---

## Deliverable 9 — Recruiter AI behavior design

The agent's persona + decision policy (`agent/policy.ts` + system prompt).

- **Persona:** a world-class senior recruiter — concise, proactive, always proposes the next best action; never asks for info it already has; never requires magic words.
- **Act-vs-ask policy:** if confident and the action is safe/reversible → act and report. If a required input is missing (client, budget) → ask **only** for the missing field. If an action is irreversible/sensitive (submit to client, share link, generate package) → do it on a one-tap confirm.
- **Recruiter questions answered directly (new tools / compositions):**
  - "Who is the safest candidate?" → rank finalists by `anomalyCount asc, stabilityScore desc, availabilityConfidence desc`.
  - "Who is most likely to stay 2 years?" → rank by `retentionProbability`.
  - "Who would Andy approve?" → rank by `approvalProbability` (ClientInsight).
  - "Which should I send first?" → blend matchScore × approvalProbability × availability.
  - "Build a shortlist" → top-N with diversity-of-strengths + a one-line rationale each.
- **Proactive follow-ups:** after job creation → offer to search; after a search → offer a shortlist/package; after submit → offer to schedule/notify. (Replaces "say match.")
- **Honesty rule:** when confidence is low (cold-start client, sparse CV), say so; never present a fabricated probability as certain.

---

## Deliverable 10 — Migration strategy (non-destructive, phased, flagged)

Never a big-bang rewrite. Each phase ships behind a flag, keeps the gate green, and
falls back to the existing deterministic system if the AI path fails.

- **Phase 0 — Scaffolding (no behavior change):** add the tool registry wrapping existing handlers; add `completeTools()` to the AI wrapper; add the agent loop **behind `AI_AGENT=1`**, defaulting OFF. Existing `chat/route.ts` path unchanged when flag off.
- **Phase 1 — AI Understanding first:** flip routing so the AI Understanding/Decision layer runs first; the regex router becomes the fast-path/guardrail. Ship behind flag; A/B against the current router on a transcript test set.
- **Phase 2 — Candidate Intelligence:** add `CandidateIntelligence` + extractor; backfill existing candidates via worker; surface in the profile. Matching still deterministic (unchanged scores).
- **Phase 3 — AI Matching (Stage 2–4):** add `JobIntelligence` + Stage-4 batched matcher behind `AI_MATCHING=1`. Run **shadow mode** first (compute AI score alongside deterministic, log divergence on the benchmark scenarios), then flip default once accuracy/cost validated. Deterministic remains the verified fallback.
- **Phase 4 — Client Memory:** add `ClientInsight` + updater; compute `approvalProbability`. Cold-start safe.
- **Phase 5 — Similarity:** add pgvector + `CandidateVector` + embeddings + the similarity tools (fixes `find_similar`).
- **Phase 6 — Client Package:** add the package model + worker PDF renderer + the chat tool (the only phase adding a new dependency).

Cross-cutting guarantees throughout: verification gate stays green; every AI path has a deterministic fallback and a mocked-LLM test; secrets stay in env; the client trust boundary (no cost/notes/transcripts) holds; soft-delete + audit preserved; cost guarded by caching Stage 2/3 and batching Stage 4.

### Sequencing rationale
Order maximizes value per risk: Understanding-first (Phase 1) removes the "magic word"
ATS feel immediately with low risk; Candidate Intelligence (Phase 2) unlocks
everything downstream; AI Matching (Phase 3) is the highest-value, highest-risk change
and therefore goes through shadow-mode validation; Client Memory, Similarity, and
Packages layer on top once the intelligence substrate exists.

---

## What this explicitly does NOT do
- Does not rewrite or delete the working handlers, schema, or deterministic engine.
- Does not remove the deterministic safety net (anomaly/fact verification, fallback scoring).
- Does not adopt literal "0% deterministic" — execution and verification stay deterministic by design.
- Does not implement anything in this mission — this is the blueprint to approve before building.

## Recommended first build slice (when approved)
Phase 0 + Phase 1 (agent loop + AI-understanding-first, flagged) and Phase 2
(Candidate Intelligence model + extractor + backfill) — together they kill the
"ATS-with-chat" feel and lay the intelligence substrate that Matching, Memory,
Similarity, and Packages all depend on.
