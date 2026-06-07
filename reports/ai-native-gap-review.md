# ANVI — AI-Native Product Gap Review (Brutally Honest)

Scope: review the current implementation against the stated vision —
"100% AI, 100% conversational, 100% intelligent, 0% fake, 0% hardcoded workflows,
0% command-line experience." **No fixes were made.** This document only identifies
the gaps, with concrete file/line evidence.

Verdict up front: **The product today is an ATS with a chat box and a deterministic
scoring formula bolted on. The AI is a fallback, not the operating system.** The
vision is largely unmet at the architectural level, not just in features.

---

## The core architectural truth

The real request pipeline is:

```
message → routeIntentDeterministic() [REGEX]  → switch(intent) → hardcoded handler → static result
                         └ LLM only if regex returns null (fallback)
```

Evidence: `src/lib/ai/intent-router.ts:113-115`

```ts
export async function routeIntent(text: string): Promise<RoutedIntent> {
  const deterministic = routeIntentDeterministic(text); // ~80 lines of regex
  if (deterministic) return deterministic;               // ← AI NEVER runs for most input
  if (aiEnabled) { /* LLM classification */ }
```

So for the majority of recruiter messages, **the LLM is never consulted at all** —
a regex table decides intent, and `src/app/api/chat/route.ts:50-76` is a `switch`
that dispatches to fixed handlers returning fixed shapes. This is the exact
"input → intent router → hardcoded handler → static result" the vision rejects.

---

## Problem #1 — The AI is not acting like AI  ❌ (architectural)

| Gap | Evidence |
|---|---|
| AI is a **fallback**, not the decision layer | `intent-router.ts:114` — deterministic regex wins first |
| Dispatch is a hardcoded `switch` over 13 fixed intents | `chat/route.ts:50-76` |
| "Magic word" persists | After job creation the reply literally says `…say "match" and I'll start sourcing` (`intake.ts:149`). The AI does **not** auto-source; it waits for the keyword. |
| Conversational job creation is a **regex slot-filling state machine**, not reasoning | `intake.ts` — `FIELDS[]` with regex `apply()` per field; fixed question order (budget → workMode → employmentType → seniority → english → client) |
| ATS-style menus | `intake.ts` returns `buttons` for work mode / employment type / seniority — menu clicking, not conversation |

**The vision's example does not happen.** Vision: paste a role → AI states what it
parsed, asks only for the genuinely missing fields, offers to attach + **start
searching**, then **presents candidates and offers a shortlist package** — all
proactively. Reality: a rigid one-field-at-a-time questionnaire that ends with
"say match." It never proactively searches, never offers a package, never reasons
about what to do next.

---

## Problem #2 — Candidate intelligence is far too weak  ❌

The CV parser extracts a thin, flat record — **not a structured intelligence
object.** Full extraction schema (`src/lib/ai/cv-parser.ts:179-186`):

```
full_name, email, phone, title, country, location, english_level,
seniority, total_years, summary, skills[{name, years}],
employments[{company, title, start, end}]
```

**Everything the vision asked for is missing** — not extracted, and there is **no
column to store it** (`prisma/schema.prisma` `Candidate` model):

| Requested intelligence | Extracted? | Stored? |
|---|:--:|:--:|
| technologies / frameworks (vs languages) | partial (flat skills) | flat |
| cloud providers / databases (typed) | ❌ | ❌ |
| industries | ❌ | ❌ |
| company sizes (startup/enterprise) | ❌ | ❌ |
| leadership / management experience | ❌ | ❌ |
| spoken vs written languages | ❌ (English only) | ❌ |
| city / timezone | ❌ | ❌ |
| relocation willingness | ❌ | ❌ |
| remote experience | ❌ | ❌ |
| startup vs enterprise experience | ❌ | ❌ |
| certifications | ❌ | ❌ |
| education | ❌ | ❌ |
| military experience | ❌ | ❌ |
| communication confidence | ❌ | ❌ |
| salary expectations (from CV) | ❌ (manual field only) | partial |
| stability / avg tenure / job-hopping | computed **on the fly** (`insights.ts`), not persisted | ❌ |

The candidate is a parsed CV, exactly as the vision says it should NOT be.

---

## Problem #3 — Matching is simplistic and barely "AI"  ❌ (highest business risk)

The spec promised a 3-stage pipeline: fast filter → structured scoring → **AI
analysis of the finalists** (spec §7.1). **Stage 3 does not exist.**

`src/lib/matching/funnel.ts:155` `runMatch` = `stage1Filter` (SQL skill overlap,
`funnel.ts:99-129`) → `stage2Analyze` (`funnel.ts:131`) → **`analyzeCandidate`,
which is pure deterministic arithmetic** (`src/lib/matching/scoring.ts:84-202`).
There is **no LLM call anywhere in the matching path.**

The entire "intelligence" is a fixed weighted sum:

```
score = skillRatio*62 + min(advMatched*4,10) ± 12 (years) ± 6 (english)
        ± 8 (budget) + 5 (available) + freshness ± anomaly
```
(`scoring.ts:97-187`)

This is **"like a SQL query," not "like a senior recruiter"** — exactly the
complaint. It cannot answer:

- *How much* React, **in what environment** (startup vs enterprise)? → not modeled.
- Leadership / scope? → not modeled.
- **Similarity to previously successful hires?** → not implemented at all.
- **What would this client probably approve?** → client memory / approval
  probability (spec §7.3) is **not implemented**.

Skill matching is binary presence + a years threshold with flat "partial credit"
(`scoring.ts:51-61`). The fast filter is "has ≥1 of the job's skills"
(`funnel.ts:110-126`) — coarse string overlap on canonical names.

**Matching quality is "the entire company," and it is currently a formula.**

---

## Problem #4 — The chat is not the product  ❌

Some conversational surface exists, but most vision phrases are unsupported or
**silently wrong**:

| Vision phrase | Reality |
|---|---|
| "Find candidates similar to Vasya but cheaper" | `find_similar` → `handleMatch` (`chat/route.ts:54-62`) which matches the **most-recent JOB**, not similarity to Vasya. **Wrong result, silently.** |
| "Find candidates Andy would probably approve" | No client-memory/approval model → mis-routes to a job match. |
| "Create a client presentation" | **No handler. Unsupported.** |
| "Generate a candidate package" | **No handler. Unsupported.** |
| "Build a shortlist" | **No handler. Unsupported.** |
| "Show me the safest candidate" | **No intent. Falls back to a help message.** |

The Copilot is a **command interpreter for ~13 known intents**, not a partner that
reasons over an open request. New phrasing outside the regex/intent list degrades
to a canned fallback (`chat/route.ts:165-176`).

---

## Problem #5 — Client package / CV generation is entirely missing  ❌

A repo-wide search for `package | anonymi | pdf | presentation | generate-cv`
returns **nothing** in `src/`. There is:

- **No** "create a client package" action/handler.
- **No** anonymized, client-facing CV generation (strip phone/email/LinkedIn).
- **No** branded PDF, logo, or professional formatting.
- **No** one-click candidate one-pager.

The share portal (`src/components/ShareView.tsx`) shows raw client-safe fields
inline; it is **not** a generated, branded, downloadable package. This is a major
staffing-agency table-stakes gap, completely unbuilt.

---

## Problem #6 — Client transparency is shallow  ❌

The client portal lists candidate cards + per-candidate decision buttons and (now)
a gated interview status. It does **not** present a role dashboard:

- ❌ role status / stage of the search
- ❌ "N candidates submitted / N interviews completed / N pending"
- ❌ pending actions or next steps
- ❌ recruiter updates / activity stream

The "client experience timeline" (position opened → N scanned → N matched → N
screened → sent → interview → hired) described in the spec (§10.3) and roadmap
Phase D is **not built**. The client sees a candidate list, not a transparent
operation.

---

## Honest counter-point (the trade-off the vision under-states)

The deterministic-first design was a **deliberate** choice, and it bought real
properties the team valued earlier: explainable scores ("no black box"), zero AI
cost/latency on the hot path, offline/no-key operation, and trustworthy anomaly
flags. Going "100% AI, 0% deterministic" trades those away for: per-request LLM
cost + latency, hallucination risk in scoring/extraction, and harder
explainability/repeatability. The right target is almost certainly **AI-primary
with a deterministic safety net** (AI reasons and decides; deterministic checks
verify facts and anomalies) — not literally 0% deterministic. The report flags this
so "100% AI" is adopted with eyes open, not as a slogan.

---

## Gap severity ranking

| # | Gap | Severity | Why |
|---|---|---|---|
| 1 | Matching is a deterministic formula; no Stage-3 AI, no similarity-to-hires, no client memory | **CRITICAL** | "Matching is the entire company" |
| 2 | AI is a fallback, not the decision layer (regex-first routing + switch handlers) | **CRITICAL** | Violates the core vision |
| 3 | Candidate is a flat parsed CV, not a structured intelligence object | **HIGH** | Feeds #1; most requested fields unextracted/unstored |
| 4 | No client package / anonymized branded CV generation | **HIGH** | Table-stakes for a staffing agency; fully absent |
| 5 | Chat supports ~13 fixed intents; key vision phrases unsupported or silently wrong (`find_similar`) | **HIGH** | "Chat is the product" unmet |
| 6 | Client transparency is a candidate list, not a role dashboard/timeline | **MEDIUM** | Roadmap Phase D, unbuilt |
| 7 | Conversational intake is a regex slot-machine with menu buttons | **MEDIUM** | "0% menus / 0% hardcoded" unmet |
| 8 | "Magic word" (`match`) + canned fallbacks remain | **MEDIUM** | "0% command-line" unmet |

---

## Bottom line

The system is a competent, well-tested **deterministic ATS with a chat veneer**.
Against the stated vision it is, honestly:

- **AI-native?** No — AI is an opt-in fallback, absent from matching entirely.
- **Conversational?** Partially — a fixed command set, not open reasoning.
- **Intelligent?** The matching is a formula; candidate data is shallow.
- **0% hardcoded / 0% fake / 0% command-line?** Not met — regex routing, slot-fill
  menus, "say match," and a hand-tuned score dominate.

The largest, most valuable correction is **#1 + #3 together**: make extraction
produce a rich candidate intelligence object, and make matching reason (AI-primary,
deterministic-verified) including similarity-to-successful-hires and client-approval
likelihood. #4 (client package/CV generation) is the biggest single missing
*feature*. No code was changed; this is the gap map to decide from.
