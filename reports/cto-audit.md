# ANVI — CTO Due-Diligence Audit

**Context:** written as if performing technical due diligence before a $1M investment.
The mandate is to find what breaks, not to praise. Where the system is genuinely
good I say so once and move on; the rest is problems, ranked by how much they should
scare an investor.

**TL;DR for the IC:** The *intelligence layer is real and measurably good* (deterministic,
explainable, 100% recall and 5/5 anomaly catch on the benchmark, $0 inference cost).
The *product around it is a single-tenant demo with no authentication, no access
control, synchronous everything, and unbounded queries.* It is a compelling vertical
slice and a credible team signal. It is **not** a system you can put real client PII
into next week. Fundable as a seed bet on the engine + team; **not** production-ready.
Budget ~2–3 months of hardening before a paying pilot.

---

## 1. Intelligence quality review

**What's strong (and verified):**
- Scoring is deterministic and **fully explainable** — every match score decomposes
  into signed component contributions (`scoreBreakdown` in `src/lib/matching/scoring.ts`,
  surfaced in the drawer/profile as "Why this score"). No black box. This is the single
  best thing in the codebase.
- Freshness is now a first-class ranking signal (`src/lib/matching/freshness.ts`),
  green/yellow/amber/red, and demonstrably moves stale-but-skilled candidates down
  (benchmark scenario D: "Stale Sam" is a true match but ranks 4th).
- Strengths/risks are evidence-backed, not adjectives.

**What's weak / will embarrass you in front of a sophisticated buyer:**
- **The weights are uncalibrated magic numbers.** `skillRatio * 62`, `+10` experience,
  `-18` per high anomaly — hand-tuned, never fit to a single real hiring outcome. There
  is no feedback loop from "did this placement succeed?" back into the model. The score
  *looks* principled because it's explainable, but it is not *validated* against reality.
- **Anomaly coverage is only as good as a 35-row hand-maintained table.** The
  "impossible tenure" rule depends on `SKILL_CATALOG` release years
  (`src/lib/ai/skills.ts`). Real CVs contain hundreds of skills; anything not in the
  table silently can't trigger that rule (false negatives). Same for skills that don't
  canonicalize — they pass through as free text and never match a release year.
- **`careerStartYear` is a single nullable field** that imports rarely populate. When
  null, `careerYears()` falls back to employment history or `totalYears`; for imported
  candidates with neither, three anomaly rules (skill>career, title-vs-experience,
  suspicious pattern) silently no-op. The engine is strongest on hand-curated data and
  weakest on exactly the bulk-imported data it will mostly see.
- **Duplicate detection is scoped to a single match result set** (`stage2Analyze`),
  keyed on email/name. Two duplicates that never appear in the same shortlist are never
  flagged, and imports often lack emails. There is no global dedupe sweep.
- **The LLM is barely in the loop.** Parsing/routing fall back to deterministic engines
  whenever no key is set (which is the default), and the JSON extraction is a hand-rolled
  bracket-walker (`extractJson` in `src/lib/ai/anthropic.ts`) with no schema validation
  and no eval harness. The "AI" story is mostly classical heuristics wearing an AI badge —
  which is *fine and arguably better* (cheap, deterministic, testable), but don't sell it
  as an LLM product; it isn't one yet.

**Verdict:** B for the deterministic engine, D for ML maturity. Good bones, zero
calibration, brittle on messy real-world input.

---

## 2. Matching quality review

Benchmark (`npm run benchmark`, `reports/benchmark.md`) on a 22-candidate labeled set:

- **Recall 100%** across all four scenarios, **top-1 correct every time.** Good.
- **Precision@5 is 50–80%** — but read the detail before celebrating *or* panicking:
  the "misses" are crossover engineers correctly **ranked below** the true positives
  (e.g., a Postgres-strong full-stack dev surfacing in the *Python* scenario at score 53
  vs 100/91 for real Python devs). The ranking is sound; precision@5 is a harsh metric
  when a scenario has only 2–4 true positives.

**The real finding hiding behind that:** **Stage 1 is too permissive.** It admits any
candidate with **≥1 required skill** (`stage1Filter` in `src/lib/matching/funnel.ts`).
A Postgres-only candidate passes the "Senior Python" filter because Postgres is one of
the required skills. Stage 2 correctly down-ranks them, but they consume shortlist slots
and inflate the analyzed set. At 100k this is a real cost multiplier.

**Worse, Stage 1 does not implement what the spec claims.** The spec's Stage-1 funnel
lists years-per-skill, language fluency, and profile recency as *filter* dimensions.
In code, Stage 1 only filters on `availability != placed` + coarse skill overlap; every
other dimension is deferred to Stage 2. So the "100k → 80 with cheap SQL" story is
half-true: the cheap stage is weaker than advertised, pushing more work into the
expensive stage.

**Also:** `runMatch` **ignores the `candidate_analysis` cache it writes.** Every match
recomputes from scratch and then `persistAnalyses` writes rows nobody reads. Either use
the cache or delete the table.

---

## 3. Anomaly quality review

- Benchmark: **5/5 planted anomalies caught, 0 false positives.** On curated data, the
  engine is genuinely sharp, and it's the demo's "wow."
- It found a **real data-leak bug during this very audit**: the client share link was
  exposing *internal* notes when `shareNotes` was on (caught by `scripts/client-sim.ts`,
  fixed in `src/lib/share.ts`, locked with a test). That's the audit working — but it
  also tells you the trust boundary is enforced ad hoc and was already broken once.
- Rules are heuristic and **English/Latin-name biased** (name-normalization for dedupe,
  title regexes like `senior|sr|lead`). Non-Latin scripts and non-English titles will
  under-detect.
- No rule for **fabricated employers, plagiarized CV text, or AI-generated profiles** —
  the emerging threat in 2026 sourcing. The anomaly engine catches arithmetic
  impossibilities, not deception that is internally consistent.

**Verdict:** excellent precision on the failure modes it models; blind to the ones it
doesn't, and the model set is small.

---

## 4. Performance review

Measured: Stage-2 analysis is **embarrassingly cheap** — 50,000 candidates analyzed in
**127 ms** in-memory (~2.5 µs/candidate, ~394k/s), single-threaded. Stage 2 is not your
bottleneck and never will be.

**Unmeasured and concerning — Stage 1 at scale.** `stage1Filter` does
`findMany({ where: { skills: { some: {...} } }, orderBy: { updatedAt: 'desc' }, take: cap*4 })`
then **refines in memory**. At 100k rows with a many-to-many `candidate_skill` join and an
`ORDER BY updated_at` that can't use the skill filter's index, this is the query that will
get slow first, and it has **never been load-tested**. The "overfetch ×4 then filter in
Node" pattern is a smell that hides a missing composite index / proper SQL predicate.

Other hotspots:
- **Notifications block the request.** `applyStage` awaits `notifyBoth`, which makes a
  **synchronous outbound Telegram HTTP call** inside the transaction-adjacent path. If
  Telegram is slow, the recruiter's "move to screened" click hangs.
- **Import is synchronous and O(rows × skills) sequential awaits** with a per-row,
  per-skill `skill.upsert` (`ingestRows`). A 10k-row file = tens of thousands of
  round-trips on the request thread → guaranteed timeout. No batching, no streaming, no
  job queue.
- **Every list endpoint is unbounded.** `GET /api/candidates` returns the entire table.
  No pagination, cursor, or limit anywhere. This falls over at a few thousand rows in the
  browser alone.

---

## 5. Scaling risks

- **Single Postgres, single Next process, no queue, no cache.** The spec name-drops
  pg-boss, pgvector, and Redis; none are implemented. Semantic "find similar" is a chat
  intent that routes to the same keyword funnel — there is **no vector search** despite
  the pitch.
- Matching pulls candidate rows into Node and scores in-process — memory-bound and not
  horizontally shardable as written.
- No read replicas, no connection pooling config beyond Prisma defaults, no rate limiting.
- The "100k candidate" headline is **proven only for Stage 2 in memory**, not for the DB
  funnel or the API/UI that would actually serve it.

---

## 6. Security review — *this is the section that should block the wire transfer*

- **There is no authentication. Anywhere.** The recruiter app and every `/api/*` route
  are wide open. Anyone who can reach the host can read all candidate PII, move pipelines,
  create share links, and import data. `RECRUITER` is a hardcoded object; `actor` is a
  free enum, not a real user — so there is **no audit trail tying actions to identity.**
- **No authorization / multi-tenancy.** No org/team/user model. One leaked URL = the whole
  database. You cannot onboard a second agency without a rewrite.
- **Unauthenticated mutation endpoints:** `POST /api/pipeline`, `POST /api/import/commit`,
  `POST /api/jobs/:id/share` are all open to the internet. The **public client decision
  endpoint** (`/api/share/:token/decision`) has **no rate limiting and no CSRF/abuse
  controls** — a leaked token lets anyone approve/reject candidates indefinitely.
- **Share tokens never expire by default** and there is no revoke-from-UI, no view audit,
  no "who opened this." A forwarded link is a permanent, silent data window.
- **PII / compliance is absent.** This is cross-border candidate PII (names, rates,
  histories). No consent tracking, retention policy, right-to-deletion, encryption-at-rest
  configuration, or access logging. GDPR/again-CCPA exposure is real and unaddressed.
- Secrets live in a committed `.env` (empty here, but the pattern invites leakage); no
  secret manager, no key rotation.
- The internal-vs-client field boundary is enforced by **omission in one function**
  (`resolveShareLink`) — exactly the pattern that already leaked once. It needs to be a
  typed DTO with contract tests, not a hand-maintained projection.

**Verdict:** F. Not a list of nice-to-haves — these are go/no-go items before any real
data enters the system.

---

## 7. Architecture review

**What exists (and is decent):** a clean monolith — Next.js App Router + TypeScript +
Postgres + Prisma, no Supabase. Intelligence is well-separated into pure, testable
modules (`src/lib/matching/*`, `src/lib/ai/*`) with a genuine split between pure logic
and I/O. 79 tests including DB/API/authz/UI/regression. Migrations are real and tracked.
For a solo/early build this is above-average discipline.

**Structural debt:**
- **No domain/user model.** Identity, tenancy, and roles are missing at the schema level —
  the most expensive thing to retrofit later, and it touches every table (needs `org_id`
  almost everywhere for row-level isolation).
- **Stateless chat with a single `jobId` ref.** "match" guesses the most-recent open job;
  fragile and surprising. The "AI OS" is really a command bar over CRUD.
- **SPA shell with in-memory routing.** No URLs for candidates/jobs/pipeline; refresh
  loses state; no browser history or deep links. Fine for a demo, wrong for an app people
  live in.
- **JSON columns** (`strengths/risks/anomalies`) are untyped at the DB layer — schema drift
  waiting to happen.
- Cache table written but never read (see §2).

---

## What's missing (functional)

- Authentication, authorization, multi-tenancy, audit log. *(blocker)*
- Pagination / cursors on all list APIs. *(blocker at scale)*
- Background job queue (import, analysis, notifications) + batched import. *(blocker for real files)*
- File storage for CVs and interview videos (`cvUrl`/`recordingUrl` are bare strings; no upload).
- Semantic / vector search (pgvector) — pitched, not built.
- WhatsApp assistant (§7) and Timeless interview capture (§5) — not built; `Interview`
  table exists with no provider.
- Share-link lifecycle: expiry defaults, revoke UI, view analytics, throttling.
- Sourcing (net-new candidates) — ANVI matches an existing pool; it doesn't fill it.

---

## UX weaknesses

- No deep links / browser history; refresh = lose place.
- Errors via `alert()` (pipeline move); no skeletons on some loads.
- Freshness/anomalies shown only on detail views, not on list/board cards (now partially
  added to chat cards).
- No bulk actions, no mobile layout for the recruiter app, no undo on pipeline moves or
  client decisions.
- Import doesn't validate data quality (e.g., absurd rates) before commit.

---

## Prioritized roadmap (what I'd fund, in order)

**Phase A — Make it safe to hold real data (must-have before any pilot, ~3–4 wks)**
1. AuthN (sessions) + a real `User`/`Org` model; replace hardcoded recruiter; make `actor`
   a FK; add `org_id` + row-level scoping on every query. Audit log of mutations.
2. AuthZ on every `/api/*` route; rate-limit + CSRF the public share endpoints; default
   share-link expiry + revoke UI + view audit.
3. Convert the client-safe boundary to a typed DTO with contract tests (the leak proved
   this is needed).
4. PII baseline: retention, deletion, encryption-at-rest config, access logging.

**Phase B — Make it not fall over (~3–4 wks)**
5. Pagination/cursors on all list endpoints; move analysis/import/notifications to a queue
   (pg-boss); batch the importer; load-test Stage-1 at 100k and add the missing
   composite indexes / real SQL predicates (years, language, recency).
6. Use the `candidate_analysis` cache (or remove it); global dedupe sweep.

**Phase C — Make the intelligence defensible (~4 wks)**
7. Calibrate scoring weights against real placement outcomes; expand the skill/release-year
   data to hundreds of entries (or derive it); handle null `careerStartYear`; broaden
   anomaly rules (fabricated employers, AI-generated CVs); add an LLM eval harness if the
   LLM path is to be trusted.

**Phase D — Resume the feature roadmap**
8. pgvector semantic search, WhatsApp assistant, Timeless capture, file storage.

---

## Bottom line

The engine is real, explainable, fast, and the team clearly knows how to build cleanly
and test seriously — the audit itself surfaced and the team fixed a live data-leak in the
same session, which is a good sign. But today this is a **single-tenant, unauthenticated
demo** with an excellent matching core bolted onto a product that cannot yet be exposed to
a real client or a real candidate database. **Invest in the team and the engine; gate the
money on Phase A landing.** Do not let anyone put production PII in this until §6 is closed.
