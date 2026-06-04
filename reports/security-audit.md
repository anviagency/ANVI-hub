# ANVI Security Audit — Mission 3.5 (Production Readiness Gate)

Closes the §6 blockers from the CTO audit. Every claim below is backed by a guard
in code and a passing test; the runtime smoke results are reproduced at the end.

## What was implemented

### Authentication
- **User model** (`user` table) with scrypt-hashed passwords (Node `crypto`, no
  external dep) — `src/lib/auth/password.ts`. Salted; same password → different
  hashes; constant-time compare.
- **Opaque session tokens**, stored only as a SHA-256 hash, in an **httpOnly,
  SameSite=Strict** cookie with a 7-day TTL — `src/lib/auth/session.ts`,
  `session` table. Expired/invalid sessions are rejected and cleaned up.
- Routes: `POST /api/auth/login` (rate-limited, generic failure message),
  `POST /api/auth/logout`, `GET /api/auth/me`. Login page at `/login`.

### Authorization & roles
- **Roles:** `admin`, `recruiter`, `client` (`Role` enum). Recruiter routes
  require `recruiter|admin`; client-role users are rejected (403).
- **Guard** (`src/lib/auth/guard.ts`): `authenticate()` (401/403) and
  `authorizeMutation()` (adds same-origin/CSRF check). Applied to **every**
  `/api/*` route — reads and writes.
- **Edge middleware** (`src/middleware.ts`) redirects unauthenticated browser
  navigation to `/login` (defense-in-depth; real enforcement is in the guards).

### Mutation protection (CSRF)
- Cookie auth is paired with a **same-origin check** on all state-changing
  requests (`checkSameOrigin`). A valid session used from a foreign Origin is
  rejected (403) — verified at runtime.

### Audit logs
- Append-only `audit_log` table + `audit()` helper. Records who/what/which-entity
  with IP for: login, login_failed, logout, job_created, client_created,
  note_added, pipeline_move, match_run/enqueued, share_created, share_revoked,
  import_enqueued, and client decisions (approve/reject/interview).

### Share-link lifecycle
- **Default expiry** of 30 days on every link (overridable) — a forwarded link is
  no longer a permanent data window.
- **Revocation** via `POST /api/share/:token/revoke` (recruiter/admin), with
  `revokedAt`/`revokedBy` recorded. Resolution rejects revoked/expired tokens.
- **View tracking**: `viewCount` + `lastViewedAt` per link for the audit trail.
- The internal-vs-client boundary remains enforced (internal notes never cross,
  cost never crosses, raw anomalies never cross — locked by the share-auth tests).

### Rate limiting
- Fixed-window limiter (`src/lib/security/rate-limit.ts`): login `10/5min/IP`,
  public share view `60/min/IP`, public decision `30/min/IP`.
- **Caveat (honest):** in-process / per-instance. Correct for a single node;
  multi-instance deployments must move this to Redis. Tracked in remaining-risks.

## Proof

**Tests (101 passing, `npm test`):** `auth.api.test.ts` (login, wrong-password
401, missing-session 401, recruiter 200 vs client 403, audit-log written),
`password.test.ts`, `rate-limit.test.ts`, `share.auth.test.ts` (expiry, revoke,
internal-note non-leak, token authz), `queue.test.ts`, `cache.test.ts`.

**Runtime smoke (live server):**
```
POST /api/pipeline        (no auth)            -> 401
POST /api/jobs            (no auth)            -> 401
POST /api/clients         (no auth)            -> 401
POST /api/import/preview  (no auth)            -> 401
GET  /api/jobs            (no auth)            -> 401
GET  /api/candidates      (no auth)            -> 401
POST /api/auth/login      (recruiter)          -> 200  (+ httpOnly cookie)
GET  /api/jobs            (with cookie)        -> 200
POST /api/jobs/:id/share  (cookie, Origin evil)-> 403  (CSRF blocked)
GET  /api/share/<token>   (public, token)      -> 200
GET  /api/jobs            (client role)        -> 403
```

**Goal — "no unauthenticated write operations remain": MET.** Every `/api/*`
mutation requires a valid session + same-origin; the only public endpoints are
the token-authorized share view and decision (both rate-limited).

## Default credentials (seed — change before production)
- `admin@anvi.com` / `admin1234` (admin)
- `daria@anvi.com` / `recruiter1234` (recruiter)
- `andy@northwind.example` / `client1234` (client)
