# Remaining Production Risks — after Mission 3.5

The four P-blockers are closed (auth/authz/audit/rate-limit; cache used; scale
measured; async infra). This is what an honest CTO still would NOT sign off on
for an unattended, multi-tenant, real-PII launch. Ranked by severity.

## High

1. **No multi-tenant isolation (org scoping).** There are users and roles, but
   no `org_id` on candidates/jobs/clients. A recruiter from agency A can read
   agency B's data. Single-agency safe; multi-tenant NOT. Retrofitting `org_id`
   touches every table and query — do it before the second customer.
2. **Rate limiting is per-process, in-memory.** Behind >1 instance or a restart,
   the limits reset / don't share state. Brute-force and share-link abuse
   protection degrades horizontally. Move to Redis (or Postgres-backed) before
   running multiple app nodes.
3. **No encryption-at-rest / secrets manager / PII lifecycle.** Candidate data is
   cross-border PII. There is no retention policy, right-to-deletion workflow,
   field-level encryption, or DB-level at-rest encryption config. GDPR/CCPA work
   is unstarted. Required before holding real candidate data at volume.
4. **Sessions can't be globally revoked and don't rotate.** Logout kills one
   session; there's no "sign out everywhere", no rotation on privilege change, no
   device list. A stolen cookie is valid for 7 days.

## Medium

5. **Import payload rides through the job table as JSON.** `import_candidates`
   stores all parsed rows in `background_job.payload`. A 500k-row file = a huge
   jsonb row. Large/streamed imports should land in object storage and the job
   should reference a key, not inline the data. Also: no file-size cap, no
   xlsx zip-bomb guard.
6. **Single worker, at-least-once semantics.** Handlers must be idempotent;
   `deliver_notification` could double-send on retry (low impact), `analyze_job`
   is idempotent (upsert). No dead-letter queue surfaced in the UI; failed jobs
   sit in `failed` with no alerting.
7. **Stage-1 selectivity is data-dependent.** The load test used a ~50%-per-skill
   distribution and the `ORDER BY updated_at DESC LIMIT 320` plan stayed ~5ms at
   500k. A **rare** required skill forces the backward index scan to walk much
   further before filling the limit — that pathological case is NOT benchmarked
   and could be 10–100× slower. Add a covering/partial index strategy and test
   the rare-skill case before claiming 100k+ broadly.
8. **CSRF relies on Origin/Referer.** A request with neither header is treated as
   same-origin (to allow server-to-server). Browsers always send Origin on
   cross-site state-changing fetches, so this is sound for browser clients, but a
   double-submit token would be strictly stronger.
9. **No account lockout or MFA.** Login is rate-limited per IP but there's no
   per-account lockout, no MFA, no password policy. Credential-stuffing resistant
   only at the IP layer.

## Low / operational

10. **No HTTPS/security headers config in-repo** (HSTS, CSP, X-Frame-Options).
    `secure` cookies are gated on `NODE_ENV=production` but the reverse-proxy TLS
    + header policy is deployment work, not in the codebase.
11. **No observability**: no structured logging, metrics, tracing, or error
    reporting. Audit log exists but there's no admin UI to read it.
12. **`scoreBreakdown` is empty on cache hits** (we recompute only freshness).
    Minor UX: the "Why this score" panel is blank when served from cache. Either
    cache the breakdown or recompute it (it's microseconds).
13. **Worker is a separate process with no supervisor/health check** in-repo.
    Needs a process manager + liveness probe in deployment.

## What is genuinely solid now
- AuthN/Z on every endpoint; CSRF on mutations; audit trail; share-link expiry +
  revocation + view tracking; rate limiting on the public surface.
- Match runtime + memory are flat to 500k (measured); Stage-2 is ~µs/candidate.
- The analysis cache is read and correctly invalidated; all 8 anomaly rules fire,
  including on imported candidates (careerStartYear fallback).
- External HTTP (Telegram) and long work (import, analysis) are off the request
  path on the Postgres-backed queue.

## Recommended order before an unattended real-PII launch
1. `org_id` multi-tenant scoping (High #1).
2. Redis-backed rate limiting + session revocation/rotation (High #2, #4).
3. PII lifecycle: retention, deletion, at-rest encryption (High #3).
4. Object-storage imports + file-size/zip-bomb guards (Med #5).
5. Rare-skill Stage-1 load test + index tuning (Med #7).
6. Security headers/TLS, observability, admin audit UI (Low).
