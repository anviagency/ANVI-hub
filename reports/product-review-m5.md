# ANVI — Mission 5 Product Review & Gap Analysis

**Method:** the app was started locally (`npm run dev` + `npm run worker`) against the
seeded Postgres (3 clients, 14 candidates incl. anomaly cases, 3 jobs, 3 users). The
full 10-step lifecycle was driven over real HTTP (`scripts/sim-m5.ts`) with real
records, timings captured, plus targeted probes for missing endpoints, the chat
intents, and data integrity. Every finding below was *observed*, not assumed.

**One-line verdict:** the "happy path" demoware works and is genuinely fast, but a
recruiter **cannot run a full hiring process in ANVI today** — sourcing, candidate
data capture, candidate communication, real scheduling, editing anything, and the
offer stage all live outside the product, and a state-machine bug breaks the
headline "client approves after screening" flow.

---

## Simulation transcript (highlights, real timings)

| Step | Result | Time |
|---|---|---|
| 1. Create job (chat) | Returns a **preview only**; persisting needs `chat → clients/resolve → POST jobs` (3 calls) | 145ms parse |
| 2. Matching | 8 ranked candidates, anomalies + freshness shown | 418ms |
| 3. Candidate review | `cvUrl=NONE, linkedin=NONE`, notes/timeline present, analysis served from **cache** ✅ | fast |
| 4/8. Schedule screening | Interview + tag + reminders created — **no calendar event, no meeting link, no candidate invite** | fast |
| 5. Submission | Pipeline `new → sent_to_client` | 145ms |
| 6. Client portal | Per-job share link, client-safe view ✅ | fast |
| 7. WhatsApp | `candidate_submitted` delivered by worker (`sent`) ✅ | async |
| 9. TimeOS ingest | Summary attached, pipeline → `screened` ✅ | fast |
| 10. Approval | **FAILED — HTTP 500** (`screened → approved` blocked) ❌ | — |

---

## What works well

- **Matching + intelligence is fast and trustworthy.** 8 candidates ranked in ~0.4s
  with explainable scores, anomalies (🔴), and freshness bands. The analysis cache is
  actually used (`analysisSource=cache`).
- **The async backbone is solid.** WhatsApp/Telegram/imports/analysis run off the
  request path; the worker delivered the `candidate_submitted` message reliably.
- **The client-safe boundary holds.** Portal and WhatsApp never leak transcripts,
  internal notes, or cost. This is the most defensible part of the product.
- **TimeOS ingestion is genuinely magical when it fires** — recording + summary +
  action items attach themselves and advance the pipeline with zero recruiter clicks.
- **Auth/audit/idempotency are real.** Every action is gated and logged.

## What feels slow

- Nothing is *technically* slow (all steps < 0.5s). The slowness is **procedural**, not
  computational: creating one job is 3 API round-trips / ~5 UI interactions; getting
  candidates into the system at all (import) is a multi-screen wizard.
- First match on a fresh job recomputes (418ms) because the cache is per-(candidate,job)
  and a brand-new job has no cache yet — acceptable, but every new job pays it.

## What feels confusing

- **"Create a job" doesn't create a job.** The chat returns a preview; the recruiter
  must then answer "who is the client?" and confirm. New users will assume the job was
  saved.
- **`match` is ambiguous.** With no job context it silently matches *the most recently
  created open job*. Typing "match" after switching focus can rank the wrong role.
- **"Schedule interview" implies a calendar.** It only creates a DB record + a tag +
  reminders. No meeting is booked anywhere; the reminders count down to a meeting that
  may not exist.
- **Chat advertises features it doesn't have** (see "looked good in theory").

## What still requires manual work (inside or alongside ANVI)

- Sourcing every candidate (ANVI only searches the existing pool).
- Building the import spreadsheet by hand, then mapping columns.
- Reading CVs and typing candidate data (no upload/parse).
- Creating the actual screening/interview meeting in Zoom/Meet/Calendar and pasting the
  ANVI tag into it so TimeOS can match it.
- Messaging candidates to arrange screening (ANVI only logs notes after the fact).
- Coordinating an interview *time* with the client (no slot picking).
- Everything after "approved": offer, contract, onboarding, placement paperwork.

---

## Missing recruiter actions (no API and/or no UI)

- **Add a single candidate by hand** — there is no `POST /api/candidates`; the *only*
  way to add talent is the CSV/Excel importer. A recruiter who just met someone cannot
  enter them without a spreadsheet.
- **Edit or delete anything** — there are **zero PATCH/PUT/DELETE handlers in the entire
  API**. You cannot fix a job typo, correct a candidate's rate, cancel/reschedule an
  interview, undo a pipeline move, or remove a bad import.
- **Message a candidate** (WhatsApp/email/Telegram) — `/api/candidates/:id/message` → 404.
- **Reject with a captured reason** — the pipeline move accepts optional feedback but the
  board UI never prompts for it; recruiter rejections lose the reason (the Mission-2
  "Lena problem" reopens for recruiter-side rejects).
- **Compare candidates** — `compare` intent returns a fallback (not implemented).
- **Availability check / follow-up suggestions** — both intents return fallbacks.
- **Analytics / reports** — `/api/analytics`, `/api/reports` → 404. No time-to-fill,
  pipeline conversion, or recruiter workload view.
- **Bulk actions** — no multi-select submit/move/reject.
- **Attach a CV or document** — no file upload anywhere.

## Missing client actions

- **A persistent client home.** The portal is a per-job share link, not a login. A
  client with 3 open roles gets 3 separate links and no cross-job view.
- **Reply / ask a question.** Only the three buttons map to actions; a client who types
  "can we talk on Tuesday?" in WhatsApp is silently ignored (free-text inbound is
  recorded but does nothing).
- **Pick / propose an interview time.** The spec's date-button scheduling does not exist;
  "Request interview" just sets a stage — no time is ever chosen.
- **Download a candidate one-pager / share internally.**

---

## UX problems

- SPA with no deep links — refresh loses your place; no shareable URLs for a job,
  candidate, or pipeline (carried over from earlier reviews, still true).
- Reject has no reason prompt in the UI.
- WhatsApp delivery status isn't visible on candidate/pipeline cards (only in the
  separate Activity log).
- Job-creation flow is a multi-turn conversation for what is conceptually one action.
- No empty states that guide a recruiter toward sourcing/importing when the pool is thin.
- Pipeline board: stage change is a dropdown per card; no drag, no bulk, no undo.

## Data problems

- **Imported candidates have all skill-years = 0** (`ingest.ts:160` hard-codes `years: 0`).
  Since matching enforces `minYears`, the *primary way to add candidates produces
  candidates that match poorly and rank low*. This quietly undermines the whole funnel.
- **No file storage.** `cvUrl` / `recordingUrl` are bare strings; there is no upload,
  no CV preview, no video hosting.
- **Sparse profiles.** Seed (and realistically, imports) lack email/LinkedIn/CV/
  employment history, which also weakens the anomaly engine (tenure/overlap rules need
  employment data the importer never collects).
- **Skills are free-text-canonicalized**; unknown skills pass through verbatim, drifting
  the taxonomy over time.
- **No candidate-merge UI** when duplicates are detected — they're flagged, not resolved.

## Workflow bottlenecks

1. **Sourcing is entirely outside the product** — the single biggest daily activity of a
   recruiter has no home in ANVI.
2. **Getting candidates *in* is lossy** (CSV-only, skill-years dropped) — so even after
   sourcing externally, the data that lands is weak.
3. **Scheduling requires leaving** to create the real meeting and coordinate times.
4. **The close is blocked by a bug** (screened → approved) and then **falls off a cliff**
   (no offer/placement workflow).

## Bugs found during real usage

- **CRITICAL — client cannot approve after screening.** Once a TimeOS summary advances a
  candidate to `screened`, a WhatsApp "Approve" (or "Schedule"→hire) throws
  `Invalid pipeline transition: screened → approved`; the webhook returns **HTTP 500**
  (observed in the server log). Because the inbound `webhook_event` is already recorded
  for idempotency, **Meta's automatic retry is deduped and dropped — the client's
  approval is permanently lost with no error shown to anyone.** This breaks the exact
  flow ANVI is built to sell, in the *realistic* ordering (screen first, then approve).
  Root cause: `ALLOWED[screened]` omits `approved`/`hired`, and the inbound handler has
  no per-decision error handling so an invalid transition 500s the whole webhook.
- **MEDIUM — imported skill-years are zeroed** (data bug, above).
- **LOW — free-text WhatsApp inbound is a no-op** (recorded, never actioned or
  acknowledged), so a client who doesn't tap a button gets silence.

## Features that looked good in theory but aren't useful in practice

- **Chat "wow" intents (compare / availability / follow-up).** Advertised in the spec and
  hinted by the router, but they return a generic fallback. They raise expectations and
  then disappoint.
- **"Schedule interview."** Looks like scheduling; is really a status label + reminders
  for a meeting that exists nowhere. The reminders are confidently wrong if no real
  meeting was booked.
- **Telegram pipeline sync.** Fires on *every* stage change → noisy; and it's
  unconfigured by default so it just writes `skipped` rows. Notification fatigue with no
  payoff.
- **Per-job share links as "the client portal."** Great for one submission, wrong mental
  model for an ongoing client relationship.

---

## ⭐ Every moment a recruiter leaves ANVI for another tool

This is the core finding. In a single end-to-end hire, the recruiter leaves the
platform at least **13 times**:

| # | Moment | Tool they switch to | Why ANVI can't keep them |
|---|---|---|---|
| 1 | Receiving the job brief | Email / WhatsApp / call | No client-intake inbox; brief arrives elsewhere and is copy-pasted |
| 2 | **Sourcing candidates** | LinkedIn, Telegram channels, job boards, referrals | ANVI only searches the existing pool — no sourcing at all |
| 3 | Collecting CVs | Email / Telegram / Drive | No CV upload; candidates send files out-of-band |
| 4 | Reading & entering candidate data | Browser / Excel | No CV parsing; import is CSV-only and drops skill-years |
| 5 | Contacting candidates to screen | Telegram / WhatsApp / phone / email | ANVI logs notes but cannot message a candidate |
| 6 | Creating the screening meeting | Zoom / Google Meet / Calendar | "Schedule" makes no real meeting or link |
| 7 | Sending the candidate the invite | Calendar / email | No invite generation |
| 8 | Conducting the screening | Zoom / Meet / phone | The call tool is external (TimeOS only listens) |
| 9 | Coordinating the client interview time | Calendly / email / WhatsApp | No slot-picking; "Request interview" only flips a stage |
| 10 | Free-text client questions | WhatsApp / email / call | Only buttons are actioned; typed replies are ignored |
| 11 | Checking client/candidate threads | Gmail / WhatsApp | No unified inbox or conversation view |
| 12 | Viewing portfolio / GitHub / LinkedIn | Browser tabs | Links are bare strings, usually absent |
| 13 | Offer, contract, onboarding | DocuSign / email / contracts | No offer or placement workflow after "approved" |
| (+) | Reporting to management | Excel / Google Sheets | No analytics/reporting |

ANVI today owns roughly the **middle third** of the funnel (structure a role → rank the
existing pool → submit → client review → capture a screening summary). The **front third
(sourcing + intake)** and the **back third (interview logistics + offer + placement +
reporting)** happen in other tools.

---

## Prioritized gap analysis

### 🔴 Critical (breaks a core promise / loses data)
1. **`screened → approved/hired` transition bug** — client approval after screening 500s
   and is silently dropped on retry. The headline flow is broken.
2. **No sourcing or single-candidate intake** — a recruiter literally cannot run a hire
   in ANVI without leaving to source and then bulk-importing. (Plus: imported skill-years
   are zeroed, so the import that *does* exist produces weak matches.)
3. **Nothing can be edited or deleted** — zero PATCH/PUT/DELETE. A typo, a wrong rate, a
   mis-scheduled interview, or a bad import is permanent. This alone blocks real daily use.

### 🟠 High (forces recurring tool-switching / manual work)
4. **No candidate communication** — can't message a candidate from ANVI; all outreach is
   external.
5. **No real interview scheduling** — no calendar integration, meeting link, invite, or
   client time-selection; the "schedule" is cosmetic.
6. **No offer/placement workflow** — the funnel dead-ends at "approved."
7. **Reject-reason not captured for recruiter rejects** — reopens the feedback-loop
   problem the product was meant to solve.
8. **CV/document handling absent** — no upload, storage, preview, or parsing.

### 🟡 Medium (degrades quality / trust)
9. **Imported skill-years = 0** degrades match quality for the main intake path.
10. **Dead chat intents** (compare / availability / follow-up) advertised but unbuilt.
11. **Client portal is per-link, not a persistent account/dashboard.**
12. **Free-text WhatsApp inbound is ignored** (no acknowledgement, no routing to recruiter).
13. **No analytics/reporting** — recruiters and managers fall back to spreadsheets.

### 🟢 Low (polish / friction)
14. Job creation is a multi-step conversation for one logical action.
15. `match` defaults to the most-recent job (ambiguous).
16. No deep links / refresh loses place; no bulk actions; no undo.
17. Telegram sync is noisy and usually unconfigured.
18. WhatsApp delivery status not surfaced on cards.

---

## Bottom line for the next phase

ANVI's **intelligence core and client-trust boundary are real and good**. The gap to
"a recruiter runs the whole process in ANVI" is **not more AI** — it's the unglamorous
connective tissue: **sourcing + intake (incl. fixing the import), editing/CRUD,
candidate messaging, real scheduling, the offer/placement stage, and fixing the
screened→approved bug.** Close those and the 13 tool-switches above collapse toward
zero; leave them and ANVI remains a very good candidate-ranking tool that sits beside
the recruiter's real workflow rather than replacing it.
