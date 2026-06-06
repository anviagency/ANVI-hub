# ANVI — Baseline Report for `b7fdffd`

**Commit:** `b7fdffdcd5497b43f3ab37a862aa325a2bc9edc4`
**Branch:** `main` (in sync with `origin/main`)
**Parent:** `e582d4a` (`feat: recruiter copilot primary workflow interface`)
**Message:** `feat: close offer placement funnel`
**Date:** 2026-06-05
**Scope of commit:** 42 files changed, 3522 insertions(+), 112 deletions(-)

## Purpose of this document

Commit `b7fdffd` was pushed as a single snapshot of the full verified working
tree. That tree contained more than the offer/placement feature: several
independent in-flight workstreams were bundled together. History will **not** be
rewritten; `b7fdffd` is the accepted new baseline. This report documents exactly
what landed in `main`, so future work has an accurate ledger of what is — and is
not — covered, and so the bundling risks are recorded rather than lost.

---

## 1. Offer + Placement funnel (the headline feature)

Closes the post-approval tail required by spec §8 and the Definition of Done
(`approval → offer → placement → start date`). Before this commit `/api/offers`,
`/api/placements`, and onboarding all returned 404 and the pipeline dead-ended at
`hired`.

**Data model**
- New `Offer` model + `OfferStatus` enum (`draft | sent | accepted | declined | withdrawn`). `clientRate` (price) and `salary` (internal cost) are snapshotted at offer time.
- New `offer` value in the `PipelineStage` enum (sits between `approved` and `hired`).
- New `EventType` values: `offer_extended`, `offer_accepted`, `offer_declined`, `offer_withdrawn`.
- `Placement` extended with `offerId` (unique), `title`, `clientRate`, `startDate`, `endDate`, `status`, `onboardingStatus`, `notes`, `updatedAt`.

**Service layer** — `src/lib/offers.ts`
- Pure, unit-testable transition guard `canOfferTransition` split from I/O (spec §4.3).
- `createOffer` — validates the candidate is at a post-screening stage, snapshots rate/salary, moves the pipeline to `offer`, writes a timeline event, notifies recruiters. Rejects offers to un-advanced candidates and duplicate open offers.
- `respondToOffer` — accept (→ hire + placement), decline (records reason, → rejected), withdraw, re-send.
- `ensurePlacement` (in `src/lib/pipeline.ts`) — idempotent and offer-aware: a placement is created at most once and inherits the accepted offer's start date and client rate.

**REST API** (auth-guarded with `RECRUITER_ROLES`, Zod-validated, conventional status codes)
- `GET/POST /api/offers`
- `GET/PATCH /api/offers/[id]`
- `GET /api/placements`
- `GET/PATCH /api/placements/[id]`

**Recruiter UI**
- New **Workforce** view (`src/components/PlacementsView.tsx`) — manage placed workers: start date, onboarding status, lifecycle (active/paused/ended), notes. Wired into `src/app/page.tsx` navigation.
- **Offers panel** added to the Job Workspace (`src/components/JobWorkspace.tsx`) — extend / accept / decline / withdraw offers; the workspace endpoint now returns offers and an `offer` stage count.

**Tests & runtime proof**
- `src/lib/offers.test.ts` — offer status-machine unit tests.
- `test/integration/offers.test.ts` — create/accept/decline against the real DB, offer→placement linkage, idempotency, decline path.
- `src/lib/pipeline.test.ts` — updated for the `offer` stage and the offer tail.
- `scripts/sim-offers.ts` — real-HTTP runtime proof (create → submit → offer → accept → hire → placement → onboarding; plus 422/409/illegal-transition guards and the no-cost trust check).

---

## 2. Mission 7.1 — Recruiter redesign pieces (bundled in, not authored this session)

Conversational job creation and the Job Workspace as the operational center.

- `src/lib/chat/intake.ts` — slot-filling intake state machine (asks for budget → work mode → employment type → English → client, one field at a time).
- `src/app/api/jobs/[id]/workspace/route.ts` — single-call workspace payload (overview, counts, pipeline, top candidates, client activity, interviews, notes; offers added by §1).
- `src/app/api/jobs/[id]/suggestions/route.ts` — proactive AI nudges for a role.
- `src/components/JobWorkspace.tsx` — the workspace UI + scoped AI panel (offers panel added by §1).
- Supporting edits: `src/app/api/chat/route.ts`, `src/lib/chat/copilot.ts`, `src/components/ChatView.tsx`, `src/components/views.tsx`, `src/app/globals.css`, `src/app/page.tsx`.
- Tests: `test/integration/workspace-intake.test.ts` (multi-turn intake, client-create branch, workspace endpoint, suggestions).
- Report: `reports/recruiter-redesign-m71.md`.

---

## 3. PDF import / CV parser changes (bundled in, not authored this session)

- `src/app/api/candidates/import-pdf/route.ts` — bulk PDF CV upload endpoint (uses `unpdf`).
- `src/lib/import/cv-intake.ts` — CV intake/extraction pipeline.
- `src/lib/ai/cv-parser.ts` — hardened name detection (skip job-title lines, email fallback, confidence/warnings) per spec §6.3; `src/lib/ai/anthropic.ts` updates.
- `src/components/AddCandidate.tsx` — PDF drop UI in the add-candidate modal.
- Tests: `src/lib/ai/cv-parser.test.ts` (parser regression), `test/integration/pdf-import.test.ts`.
- Dependency: `unpdf` added to `package.json` / `package-lock.json`.

---

## 4. Job workspace changes

Covered jointly by §1 (offers/offer-stage counts added to the workspace) and §2
(the workspace endpoint, suggestions endpoint, and `JobWorkspace.tsx` UI). The
workspace is the recruiter command center; offers were layered onto it in this
commit, which is the primary point of entanglement between §1 and §2.

---

## 5. Migrations included

Two migrations were added in this commit (both already applied; `migrate status`
reads "up to date" with 7 total migrations):

| Migration | Belongs to | Contents |
|---|---|---|
| `20260605083304_job_workmode` | Mission 7.1 (§2) | Adds `job.work_mode`, `job.employment_type` (TEXT, nullable). |
| `20260605140000_offers_placements` | Offer + Placement (§1) | Creates `OfferStatus` enum + `offer` table; adds `offer` to `PipelineStage`; adds `offer_*` to `EventType`; extends `placement` (offer link, title, client_rate, end_date, onboarding_status, notes, updated_at — `updated_at` backfilled then default dropped). |

Full migration history in `prisma/migrations/`:
`20260604091030_init` → `..._pipeline_import_share_notify` → `..._auth_audit_queue`
→ `..._whatsapp_meetings` → `..._crud_intake_scheduling` →
`20260605083304_job_workmode` → `20260605140000_offers_placements`.

---

## 6. Reports committed

Two report files were **added** in `b7fdffd` (other files in `reports/` predate
this commit):

- `reports/recruiter-redesign-m71.md` — Mission 7.1 recruiter redesign writeup.
- `reports/uat-mission6.md` — black-box UAT findings (the source of the go-live priority list).

(`reports/baseline-b7fdffd.md` — this document — is added separately, after the push.)

---

## 7. Known risks from bundling

1. **One commit, four workstreams.** Offer+Placement (§1), Mission 7.1 (§2), PDF import (§3), and the workspace changes (§4) all live under a single message, `feat: close offer placement funnel`. The message under-describes the actual contents. `git bisect` and per-feature `git revert` are no longer clean for these areas.
2. **Documentation committed inside a feature commit.** `reports/recruiter-redesign-m71.md` and `reports/uat-mission6.md` are stand-alone deliverables landed inside a feature commit, which deviates from the team's git discipline (deliverables should not ride inside unrelated feature commits).
3. **Uneven runtime proof.** Only the offer/placement slice received a dedicated HTTP runtime-proof script (`scripts/sim-offers.ts`) in this session. Mission 7.1 and PDF import are covered by integration tests (`workspace-intake.test.ts`, `pdf-import.test.ts`, `cv-parser.test.ts`) but were not independently re-proven over real HTTP here.
4. **Entangled schema/migration history.** `prisma/schema.prisma` carries both the 7.1 `workMode` fields and the Offer model; the two migrations are sequential. Reverting only the offer feature would require manual surgery, not a single revert.
5. **Attribution loss.** A regression surfacing in any of the four areas points at the same commit, weakening the signal a focused history would provide.
6. **Baseline still provider-mocked (pre-existing, not caused by bundling).** WhatsApp, meeting provisioning, TimeOS, and email remain in mock mode; the client-facing "real" surface is still unproven with real humans. This is unchanged by `b7fdffd` and remains the top go-live item.

**Mitigation going forward:** treat `b7fdffd` as the immutable baseline; keep each
subsequent slice in its own focused commit with an accurate conventional message
and its own runtime proof, and commit reports separately from feature code.

---

## Post-push verification (clean, from the pushed state)

Run against `b7fdffd` with a clean working tree (this report not yet added):

| Check | Command | Result |
|---|---|---|
| Working tree | `git status` | Clean (nothing to commit, up to date with `origin/main`) |
| Tests | `npm test` | **176 passed** / 176, 29 files |
| Build | `npm run build` | ✅ Compiles (exit 0) |
| TypeScript | `tsc --noEmit` | ✅ Clean (exit 0) |
| Migrations | `prisma migrate status` | ✅ "Database schema is up to date!" (7 migrations) |

---

## Next step

No new features in this step. The next feature slice is the **Scheduling UX fix**:
a real date/time picker, proposed interview slots, and submit/schedule actions
from the review drawer (UAT Mission 6 near-bug: scheduling hard-codes `+2 days`).
