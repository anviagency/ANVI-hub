# ANVI — Mission 8: Pilot Readiness

Objective: take one real recruiter, one real client, one real position, and one
real candidate pipeline and make sure the **entire** process works — no fake
links, no dead-end workflow, no critical blocker preventing a real pilot.

This report documents what changed across Phases 1–6 and ranks every remaining
blocker. It is grounded in runtime proof, not assertions: `scripts/sim-pilot-m8.ts`
exercises Phases 1–5 over real HTTP against the real database, and every check
passes.

**Verification gate (this milestone):** `npm test` → 180 passed / 180 (30 files) ·
`npm run build` → compiles · `tsc --noEmit` → clean · `prisma migrate status` →
up to date (9 migrations).

---

## Phase 1 — Trust-breaking mocks removed

**Audit performed.** Searched the whole app for `rec.example`, fabricated
recording/meeting URLs, placeholder candidates/clients, and mock responses
reaching users.

**Findings & resolution:**
- **Fabricated meeting links.** `generateMeetingLink()` produced real-*shaped* but
  non-functional Google Meet / Zoom URLs that were stored and shown as clickable
  "Join" links to clients (and recruiters). **Fixed:** a new honesty rule
  (`resolveMeetingUrl` + `meetingRoomsConfigured` in `src/lib/meetings/links.ts`).
  A meeting URL is only stored as real when (a) the recruiter pastes a real link or
  (b) a real provider is configured. Otherwise there is **no link** and the surface
  shows status text.
- **Fake recording links.** The client share projection and the WhatsApp
  "screening completed" message passed `recordingUrl` straight through. In mock
  mode that is a dead link. **Fixed:** `projectClientInterview()` (in
  `src/lib/share.ts`) suppresses the recording link unless a real
  meeting-intelligence provider is configured, surfacing `recordingPending` →
  the portal shows *"Recording not ready yet — we'll notify you when it's
  available."* The WhatsApp event now says *"Recording will be available shortly."*
- **Client portal join link.** `ShareView` now shows the time + *"joining details
  will be shared before the call"* instead of a dead join link.
- **Seed data.** Already gated behind `SEED_DEMO=1`; production runs real-data only.
  The `.example` values that remain are internal email addresses, never
  client-facing links.

**Proof:** the client payload contains no `rec.example` / fabricated URL
(`sim-pilot-m8.ts` Phase 1; `whatsapp.test.ts`; `mission8.test.ts`).

## Phase 2 — Real scheduling

`POST /api/interviews/schedule` rebuilt: the recruiter picks **date + time +
timezone + duration**, can **propose multiple slots** (status `proposed`, no
reminders until a concrete time exists), and may paste a **real meeting link**.
The hard-coded `+2 days` (recruiter) and `+4 days` (reschedule) are gone — replaced
by a real `SchedulePanel` in `CandidateProfile.tsx` (date/time/timezone/duration,
propose-slots mode, optional real link).

- **Client selects a slot** — `POST /api/share/:token/schedule` fills a
  recruiter-proposed interview (or creates one), advancing the pipeline.
- **Reschedule / cancel** — work; reschedule re-issues reminders and **invalidates
  stale ones** (reminders now carry the target time; the handler skips a reminder
  whose time no longer matches). Cancelled interviews never fire reminders.

**Proof:** `sim-pilot-m8.ts` Phase 2 (propose → fixed+real link → reschedule →
cancel, reminders 24h/1h/10m); `crud-intake.test.ts`.

## Phase 3 — Candidate confirmation flow

New secure, login-free candidate micro-surface (`/c/:token`, `CandidatePortalView`).
A recruiter mints a link (`POST /api/candidates/:id/access`). The candidate can:
**confirm availability**, **decline availability**, **confirm the interview**, or
**request another time**. Every action feeds back:
- **profile** — `availability` + `availabilityConfirmedAt` updated;
- **availability score** — confirmation drives the freshness/availability signal
  (verified: score → 100 after confirm);
- **recruiter notifications** — one per action;
- **timeline** — `availability_confirmed` / `availability_declined` /
  `candidate_confirmed_interview` / `candidate_reschedule_requested` (with a new
  first-class `candidate` actor).

**Proof:** `sim-pilot-m8.ts` Phase 3; `mission8.test.ts`.

## Phase 4 — Minimal client communication

`POST /api/share/:token/message` — the client can **ask a question** or **request
another time** in free text from the portal (`ClientMessageBox`). Each message is
persisted (`ClientMessage`), timelined (`client_message`), and raised as a recruiter
notification. The portal also gained an explicit **Request interview** button. This
is deliberately **not** a full inbox — just enough to remove the dead end.

**Proof:** `sim-pilot-m8.ts` Phase 4; `mission8.test.ts`.

## Phase 5 — Offer completion (validated)

The offer tail from Mission 7 was validated end-to-end and every state is visible:

```
Offer Sent  →  Offer Accepted  →  Placement Created  →  Start Date Set  →  Worker in Workforce
   (sent)        (accepted)         (auto, offer-aware)   (from offer)      (Workforce view)
```

Offers render in the Job Workspace (with accept/decline/withdraw); placements render
in the **Workforce** view with start date + onboarding status. The placement
inherits the accepted offer's start date and rate, and exposes **price, never cost**.

**Proof:** `sim-pilot-m8.ts` Phase 5; `sim-offers.ts`; `offers.test.ts`.

## Phase 6 — Recruiter reality audit (proxy persona)

A literal human recruiter could not be seated in this environment, so — as in
Mission 6 — the run was an uninstructed **proxy-persona** pass over the real app,
driving the actual click-paths to count screens and remaining external tools.

**Click-path for one position (create → place):**
1. Ask ANVI: paste the role → guided intake → job + workspace (chat).
2. `match` → ranked shortlist (chat / workspace).
3. Open candidate → **Schedule** (date/time/timezone/duration; paste a real Zoom/Meet link, or propose slots).
4. **Candidate link** button → copy → send to candidate (candidate self-confirms).
5. Submit to client (chat or board) → client reviews on the portal / WhatsApp.
6. Client approves; recruiter **Extend offer** in the workspace → mark accepted.
7. **Workforce** view → set start date + onboarding.

**External tools still required (and why):**

| Tool | Still needed? | Why |
|---|--:|---|
| Video tool (Zoom/Meet/Teams) | YES | the actual call is inherent; ANVI now stores the recruiter's real link instead of faking one |
| LinkedIn / browser | YES | sourcing net-new candidates (ANVI matches the existing pool) |
| Phone / messaging to reach a candidate | PARTIAL | quick-actions launch + log; the conversation is external |
| e-sign (DocuSign) | YES | signing the actual contract (offer status is tracked in ANVI; the signature is external) |
| WhatsApp (as ANVI's channel) | MOCKED | provider unconfigured — see Integration blockers |
| Email | MOCKED | provider unconfigured |
| Calendar | NO | reminders are automatic |
| Excel / Sheets | NO | intake + CRUD + import replace it |

**Net change vs Mission 6:** scheduling is no longer a near-bug (real picker),
candidates are no longer passive (self-confirm surface), the funnel no longer
dead-ends at "hired" (offer + placement + start date), and clients are no longer
stuck button-only (free-text). The remaining external tools are now **inherent**
(video, sourcing, e-sign) or **gated on provider keys** (WhatsApp, email).

---

## Ranked blockers

### CRITICAL — must clear before a real client pilot
*(none blocking the in-app workflow; the remaining critical items are integration provisioning)*

1. **WhatsApp Business API not provisioned (Integration / Trust).** The "client
   lives in WhatsApp" thesis is still unproven with a real human — every send runs
   through the mock provider. Provisioning Meta WhatsApp Business API + approved
   templates is the single highest go-live item.

### HIGH
2. **Meeting-intelligence (TimeOS) not connected (Integration).** Real recordings &
   summaries are not auto-ingested. Until configured, the portal correctly shows
   *"Recording not ready yet"* — honest, but the screening "magic" is not live.
3. **Real meeting-room provisioning not wired (Integration/UX).** ANVI no longer
   fakes links, but it also can't auto-create a Meet/Zoom room — the recruiter must
   paste one. Acceptable for pilot; a Google Meet/Zoom API integration removes the
   manual step. Gated behind `MEETING_ROOMS_API_KEY`.
4. **Email delivery not provisioned (Integration).** `RESEND_API_KEY` empty →
   interview reminders/notifications degrade to mock. Needed for client/candidate
   email reach.

### MEDIUM
5. **Per-process, in-memory rate limiting (Production).** Does not survive restarts
   or span instances; move to Redis before running more than one node. Public
   token surfaces (`/api/share/*`, `/api/candidate/*`) are rate-limited only per IP.
6. **No dead-letter UI / alerting for permanently failed jobs (Production).** The
   queue is single-worker, at-least-once; handlers are idempotent, but a poisoned
   job has no surfaced alert.
7. **Candidate-link `jobId` is optional and unauthenticated by design (Trust).**
   Tokens are random + expiring + rate-limited and expose only the candidate's own
   minimal data, but there is no second factor. Acceptable for pilot; revisit for
   scale.
8. **Timezone handling is best-effort (UX).** The scheduler converts wall-clock →
   UTC via `Intl`; verify against DST edge cases before heavy use.

### LOW / operational
9. **No `org_id` multi-tenant isolation** — single-agency only (out of scope, must
   never expose cross-agency).
10. **No observability** (structured logging/metrics/tracing); audit log has no
    admin UI.
11. **No security headers** (HSTS/CSP/X-Frame-Options) in-repo.
12. **Sessions can't be globally revoked** and don't rotate (7-day cookie life).

---

## Remaining mocks (explicit)

| Area | State | User-facing behavior today |
|---|---|---|
| WhatsApp send/receive | **Mock** (`MockWhatsAppProvider`) | messages persisted, not delivered to a real phone |
| Meeting intelligence (TimeOS) | **Mock** (`MockMeetingProvider`) | summaries only via manual webhook; recordings shown as "not ready" to clients |
| Meeting-room provisioning | **None** | recruiter pastes a real link, or the client sees a status note (no fake link) |
| Email (Resend) | **Mock** | reminders/notifications recorded, not emailed |
| LinkedIn enrichment | **Placeholder adapter** | URL stored; no scrape/enrich |

No mock now reaches a **client-facing** surface as if it were real data — that was
the core Phase 1 goal and it holds.

## Remaining manual work

- Recruiter creates the actual video room and pastes the link (until rooms API).
- Recruiter posts/forwards the TimeOS summary (until TimeOS webhook is live).
- Sourcing net-new candidates from LinkedIn.
- Contract signature via an external e-sign tool (offer status tracked in ANVI).

---

## Success-criteria assessment

| Criterion | Status |
|---|---|
| A recruiter can run a real recruitment process | ✅ in-app, end-to-end (sourcing + the call remain external) |
| A client can review candidates | ✅ portal: approve / reject / request interview / ask a question / pick a proposed slot |
| A candidate can confirm availability | ✅ secure micro-surface, feeds score + timeline + notifications |
| A hire can be placed | ✅ offer → accept → placement → start date → Workforce |
| No fake links | ✅ client surfaces never expose fabricated/dead links |
| No dead-end workflow | ✅ free-text + reschedule paths close the gaps |
| No critical blocker preventing a real pilot | ⚠️ **in-app workflow: clear.** The one true gate is **provisioning real WhatsApp** (and, close behind, TimeOS + email) — these need credentials, not code. |

**Bottom line:** the product is **workflow-complete and trust-safe for a pilot**.
The only thing standing between this build and a real client pilot is provisioning
the external providers (WhatsApp first), which is an operations/credentials task,
not an engineering blocker.
