# ANVI — Recruitment AI Operating System

Phase 0–2 vertical slice: the **Recruiter Copilot**. Paste a job into chat → the AI
structures it → attach a client → save → run a two-stage match over the talent pool →
get explainable strengths / risks / **anomalies** per candidate.

Stack: **Next.js 15 (App Router) · React 19 · TypeScript · PostgreSQL · Prisma**.
No Supabase. Anthropic Claude is optional (graceful deterministic fallback).

## Quick start

```bash
# 1. Postgres (Docker) — host port 5434
npm run db:up

# 2. Install + migrate + seed
npm install
npm run db:migrate      # applies prisma/migrations
npm run db:seed         # 35 skills, 3 clients, 14 candidates (incl. anomaly cases), 3 jobs

# 3. Run
npm run dev             # http://localhost:3000
```

Other commands: `npm test` (vitest), `npm run typecheck`, `npm run build`, `npm run db:reset`.

### Environment (`.env`)
- `DATABASE_URL` — Postgres connection (defaults to the docker-compose instance on `:5434`).
- `ANTHROPIC_API_KEY` — **optional**. When set, Claude is used for job parsing + intent
  routing. When unset, the built-in deterministic engine handles everything. The
  **anomaly detector and match scoring are deterministic either way** — they never call an LLM.

## What the slice does (spec mapping)

| Spec | Where |
|---|---|
| §10 data model | `prisma/schema.prisma` (+ `Employment` for anomaly checks) |
| §2.3 intent router | `src/lib/ai/intent-router.ts` |
| §11.1 job parser | `src/lib/ai/job-parser.ts` |
| §3 two-stage funnel | `src/lib/matching/funnel.ts` |
| §4.3 / §11.2 anomaly engine | `src/lib/matching/anomaly.ts` (deterministic rules) |
| §3.3 / §4.1–4.2 scoring + strengths/risks | `src/lib/matching/scoring.ts` |
| §2 chat-first copilot UI | `src/components/ChatView.tsx`, `src/app/page.tsx` |
| §4.4 candidate data room | `src/components/CandidateDrawer.tsx` |

## API
- `POST /api/chat` — intent-routed copilot brain
- `GET/POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/match`
- `GET/POST /api/clients`, `POST /api/clients/resolve`
- `GET /api/candidates`, `GET /api/candidates/:id?jobId=`

## Recruiter operations (mission 2)

| Feature | Where |
|---|---|
| Excel/CSV import (map → dedupe → update, tracks last-updated + source) | `src/lib/import/`, `POST /api/import/preview`, `POST /api/import/commit`, **Import** nav |
| Pipeline (new→screened→sent_to_client→interview→approved→rejected→hired) | `src/lib/pipeline.ts`, `GET/POST /api/pipeline`, **Pipeline** board |
| Filters/search (status, skill, country, rate, availability, name) | `GET /api/pipeline?...` + board filter bar |
| Full candidate profile (notes, comms, interviews, matched jobs, risks/anomalies) | `src/components/CandidateProfile.tsx`, `GET /api/candidates/:id` |
| Secure client share link (client-safe fields only; approve/reject/request interview) | `src/lib/share.ts`, `POST /api/jobs/:id/share`, **public** `/share/[token]` |
| Telegram sync + recruiter notifications | `src/lib/notify.ts`, `GET /api/notifications` |

Demo share link after seeding: **`/share/demo-fullstack-share`**.

Telegram is optional: set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` to push to a group;
otherwise notifications are persisted with `status="skipped"` and everything still works.

## Tests
`npm test` runs 69 vitest tests (Postgres must be up): unit (parser, router, anomaly,
scoring, import helpers, pipeline rules), DB integration (import dedupe), API
(pipeline transitions), share-link authorization, matching regression, and a jsdom
UI test of the client share view.

## Validation & intelligence (mission 3)

Harnesses that prove the intelligence layer, with generated reports in `reports/`:

| Command | What it does | Report |
|---|---|---|
| `npm run benchmark` | Runs all 4 scenarios (Senior Python, React Team Lead, DevOps, Full-Stack SaaS) through the real funnel on a labeled dataset; measures funnel reduction, runtime, precision/recall, anomaly catch, placed-exclusion, and Stage-2 scaling | `reports/benchmark.md` |
| `npm run client-sim` | Drives the public share surface end-to-end (view → approve / request-interview / reject) and asserts zero recruiter involvement + no internal-data leakage | `reports/client-simulation.md` |
| — | Modeled recruiter time-savings (per position / recruiter / month) | `reports/time-savings.md` |
| — | **Brutally honest CTO due-diligence audit** | `reports/cto-audit.md` |

Latest benchmark: **100% recall** and **top-1 correct** on every scenario, **5/5 anomalies caught, 0 false positives**, placed candidates excluded, **50k candidates analyzed in ~128 ms** ($0 inference — deterministic). The client sim runs **zero-touch** with no leakage.

Hardened in this mission: data-**freshness scoring** (green/yellow/amber/red, used in ranking — `src/lib/matching/freshness.ts`), **explainable score breakdown** ("Why this score" in the UI), and anomaly engine extended with **duplicate** + **suspicious-employment-pattern** detection. The client simulation also caught and fixed a real internal-notes leak across the client boundary.

## Production readiness (mission 3.5)

Auth, async infra, and scale hardening — closing the CTO-audit blockers.

```bash
npm run worker            # background worker: Telegram delivery, imports, analysis
npm run loadtest          # 100k/250k/500k scale test -> reports/load-test.md + query-analysis.md
npm run validate-intelligence   # anomaly-rule coverage + cache + imports -> reports/intelligence-validation.md
```

- **Auth/authz everywhere.** Every `/api/*` route requires a session (scrypt
  passwords, httpOnly SameSite=Strict cookies); recruiter vs client vs admin roles;
  CSRF same-origin check on mutations; append-only `audit_log`. **No unauthenticated
  writes remain.** Sign in at `/login` — seed users: `admin@anvi.com / admin1234`,
  `daria@anvi.com / recruiter1234`, `andy@northwind.example / client1234`.
- **Share links** expire (30d default), are revocable (`POST /api/share/:token/revoke`),
  track views, and are rate-limited. Internal notes/cost/anomalies never cross to clients.
- **Async by default.** Telegram delivery, imports, and AI analysis run on a
  Postgres-backed queue (`npm run worker`) — no request blocks on external HTTP.
- **Cache is live.** `candidate_analysis` is read by the candidate workspace, client
  portal, and `GET /api/jobs/:id/match`, and invalidated when the candidate/job changes.
- **Measured scale** (`reports/load-test.md`): Stage-1 query ~5ms and match runtime ~17ms
  at **500k candidates**, with flat memory (bounded by the funnel cap).

Reports: `reports/security-audit.md`, `load-test.md`, `query-analysis.md`,
`intelligence-validation.md`, `remaining-production-risks.md`.

## Out of scope (later phases)
WhatsApp Assistant (§7), Timeless interview capture (§5 — `Interview` table exists, no
provider wired), and the broader ongoing-workforce Client Portal (§6). `Submission`,
`Interview`, `Placement`, and WhatsApp tables are already in the schema.
