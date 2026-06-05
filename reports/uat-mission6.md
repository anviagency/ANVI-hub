# ANVI — Mission 6: User Acceptance Test (UAT)

## Methodology & honesty note (read first)

A literal human UAT — real recruiters Lena/Katya, real clients, real candidates
messaging on real WhatsApp — **could not be run in this environment**, for two
concrete reasons surfaced immediately:

1. **No real people are available to me.** I am an automated agent; I cannot seat
   a recruiter at a laptop and watch them.
2. **Every external provider is unconfigured (mock mode):** `ANTHROPIC_API_KEY`,
   `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `TIMEOS_API_KEY`,
   `RESEND_API_KEY` are all empty. So a real client **cannot receive a real
   WhatsApp message**, **cannot watch a real interview video**, and the recruiter
   gets **no real AI parsing or email**. Scenario 2 ("give a client WhatsApp
   access") is **not executable as written** without provisioning Meta WhatsApp
   Business API + approved templates.

What I *did* run instead, with rigor and **zero code changes**: a structured
**black-box UAT against the live app and the real seeded database** (3 clients, 14
real candidates incl. the planted anomaly cases, real jobs), driving the actual
UI/API as **uninstructed proxy personas** (recruiter "Lena", client "Andy"),
applying Nielsen-style usability heuristics, and recording every point where a
first-time user would stall — fixing nothing. Findings below are grounded in real
runtime behavior (captured live) plus inspection of the real UI components.

**The single most important UAT conclusion is the one above:** you cannot validate
the WhatsApp/TimeOS/AI/video product with real humans until those integrations are
actually provisioned. Everything else is secondary to that.

---

## 1. Recruiter Test Results (Scenario 1)

**Task given:** fill a real Senior React position using only ANVI — create, find,
review, submit, schedule, track.

**What worked (live-verified):**
- Create job from chat → structured preview (`Senior React Engineer`, skills, budget).
- Match → ranked candidates (`Oleksandr Hrytsenko`, score 95) in <0.5s.
- Submit from chat → `"send Oleksandr to Andy"` moved him to the client + queued WhatsApp.
- Track → pipeline kanban.
- The chat copilot is the strongest part of the recruiter experience.

**Where a first-time recruiter stalls (observed):**
- **Create job is a 3-step gate, not 1 action.** Paste → "Who is the client?" →
  type name → Continue → "Attach to Northwind?" → Yes. A first-timer expects the
  paste to *save* the job; the extra client gate surprises them, and there's no
  "view the saved job" affordance afterward (only a "say match" hint).
- **"match" is a magic word.** Nothing on screen tells a new user to type it
  (beyond the post-save hint). Typed with the wrong job in focus, it silently uses
  the most-recent job.
- **Review is split across two inconsistent surfaces.** Clicking a candidate *in
  chat match results* opens a **read-only drawer**; clicking from the **Talent
  pool** opens the **full profile** with actions. From the drawer there is **no
  way to submit or schedule** — the recruiter must leave and re-find the candidate.
- **Submitting has no button where you review.** It's either the chat command or
  the pipeline-board dropdown — neither is discoverable from the candidate you're
  looking at.
- **Scheduling is hidden and date-locked.** The only entry point is "Schedule
  screening" inside the full profile; **the UI hard-codes the time to "+2 days"
  with no date/time picker** (the API supports a time; the UI does not expose it).
  A recruiter cannot choose when the screening happens. This is a near-bug.
- **No deep links.** Refresh loses your place; you can't bookmark or share a
  candidate/job URL.

**Measured (modeled from the real click-paths):**
- Time to create job: ~30–45s (3 guided steps).
- Time to shortlist: ~5s (one `match`).
- Time to submit: ~5s via chat; ~20–30s via the board.
- Clicks for the whole flow: **~18–22**.
- Screens visited: **~6** (Login, Chat, drawer, Talent pool, Profile, Pipeline).

---

## 2. Client Test Results (Scenario 2)

**Constraint:** the **WhatsApp half could not be tested** (no Meta credentials —
nothing is delivered). Only the **share portal** is testable.

**Share portal — what a client can do (live-verified):**
- View candidates: ✅ name, country, **client rate ($38)**, match score (95),
  5 strengths, 0 risks, summary.
- Read screening summary: ✅ "Strong screening."
- Approve / Pass: ✅ buttons work (and, since Mission 5.1, approval after
  screening succeeds).
- Pick an interview time: ✅ a `datetime-local` field.

**Where the client hesitates / fails (observed):**
- **"Watch interview" is a dead link.** The recording URL is a **mock**
  (`https://rec.example/uat`) — it opens nowhere. A real client clicking "Watch
  recording" hits a broken link. **This breaks trust immediately.**
- **No WhatsApp at all** in this environment — the entire "client lives in
  WhatsApp" thesis is **unvalidated**.
- **The time picker is confusing.** A bare `datetime-local` with no offered slots,
  no recruiter availability, and an ambiguous timezone. A client expects to pick
  from *proposed* times, not invent one.
- **No way to ask a question.** Only buttons + the picker; a client who types
  "can we do Tuesday instead?" has nowhere to put it.
- **No client account / history.** The portal is a single per-job link. A client
  with several roles gets several links and no overview; an expired/revoked link
  dead-ends with no "request a new one."

---

## 3. Full Placement Results (Scenario 3)

Ran one hire end-to-end. **In-ANVI:** Job created → Candidate matched → Submitted →
Client approved (after screening) → **Hired → Placement auto-created.** ✅

**Every manual / external step in a real placement:**
| Stage | In ANVI? | Reality |
|---|---|---|
| Job created | ✅ | chat |
| Candidate matched | ✅ | existing pool only — **sourcing is external (LinkedIn)** |
| Screening scheduled | ⚠️ | record + mock meeting link; **+2 days hard-coded** |
| Screening conducted | ❌ | external video tool; **TimeOS not connected** (summary had to be POSTed by hand) |
| Client interview | ❌ | a *second* interview is just the same schedule endpoint; the call is external |
| Approval | ✅ | client button |
| **Offer** | ❌ | **no offer workflow at all** (`/api/offers` → 404) |
| Placement | ⚠️ | row auto-created, but **no UI to view/manage placements** (Clients view shows only a count) |
| Start date / onboarding | ❌ | `startDate` defaulted to "now"; **no UI to set it, no onboarding** (`/api/onboarding` → 404) |

Probed and **absent (404):** `/api/offers`, `/api/placements`, `/api/candidate-portal`,
`/api/onboarding`, `/api/inbox`.

---

## 4. Tool-Switching Analysis

| Tool | Still required? | Why |
|---|--:|---|
| **LinkedIn / browser** | YES | sourcing net-new candidates + viewing portfolios (ANVI matches only the existing pool) |
| **Video call tool** (Zoom/Meet/Teams) | YES | the actual screening + interview conversation (inherent) |
| **Phone / Telegram** | YES | reaching candidates (quick-actions *launch + log*, but the call is external) |
| **Gmail / email** | YES | free-text client & candidate threads; no inbox in ANVI |
| **DocuSign / e-sign** | YES | the offer & contract (no offer stage) |
| WhatsApp (as ANVI's channel) | N/A here | **not provisioned** — can't be evaluated |
| Excel / Sheets | **NO** ✅ | single intake + CRUD replaced the spreadsheet |
| Calendar (for reminders) | **NO** ✅ | auto reminders |

Net: **~5 external tools remain** (consistent with Mission 5.1's 13→5), and **3 of
the 5 are inherent** (video, phone, e-sign). The two addressable ones are
**sourcing discovery** and a **free-text inbox**.

---

## 5. UX Problems

### Recruiter friction
- Felt **slow / multi-step:** job creation gate; re-finding a candidate to act on them.
- Felt **confusing:** "match" as a magic word; drawer-vs-full-profile inconsistency;
  no submit/schedule action where you review.
- Required **searching:** to schedule (buried in the profile); to view a placed worker.
- **Near-bug:** scheduling hard-codes the date (+2 days), no picker.

### Client friction
- **Hesitated:** at the bare datetime picker (what time? whose timezone?).
- **Asked for help (would have):** "Watch recording" is a dead mock link.
- **Expected something different:** to reply in words / ask a question; to see all
  their roles in one place; to actually receive a WhatsApp.

---

## 6. Missing Features

**Missing recruiter actions:** date/time picker for scheduling; submit & schedule
from the review surface (drawer); a placements/worker view; an inbox of client &
candidate replies; sourcing from LinkedIn; deep links.

**Missing client actions:** ask a free-text question; choose from *proposed*
interview slots; a persistent client account across jobs; download a one-pager.

**Missing candidate actions (the biggest gap):** candidates have **no interface at
all** — no self-confirm availability, no interview confirmation, no profile access,
no consent/GDPR self-service, no visibility into where they stand. The candidate
experience is effectively zero.

**Missing notifications:** real WhatsApp delivery; real email (Resend unconfigured);
candidate-side notifications (interview invite, status); recruiter notification when
a client replies free-text.

**Missing automations:** real meeting-room provisioning; real TimeOS capture
(currently a manual webhook); offer generation; start-date/onboarding tracking;
auto follow-up nudges when contact goes stale.

---

## 7. Missing Automations (summary)

Real WhatsApp send · real meeting provisioning (Meet/Zoom) · real TimeOS join+capture ·
email reminders actually sending · offer letter generation · onboarding/start-date
sequence · stale-candidate auto-nudge.

---

## 8. Critical Bugs

- **None data-losing** found this round (the Mission-5 approval-loss bug stays fixed
  — re-verified: approve-after-screening → `hired` → placement).
- **Trust-breaking (severity high, not a crash):** "Watch recording" and "Join
  meeting" links are **mock URLs that open nowhere**. In front of a real client this
  reads as a broken product.
- **UX near-bug:** recruiter scheduling **hard-codes the date** (no picker) — the
  recruiter cannot set the real meeting time from the UI.

---

## 9. High-Priority Improvements — the next 10 (from real usage, ranked)

1. **Provision real WhatsApp Business API** (templates + delivery). Without it the
   core "client on WhatsApp" thesis is unproven and untestable.
2. **Real meeting provisioning** (Google Meet/Zoom API) — kill the dead mock links
   that break trust; make "Join meeting" real.
3. **Real TimeOS integration** — screening capture is the magic; today it's a manual
   webhook.
4. **Recruiter date/time picker for scheduling** (remove the hard-coded +2 days);
   surface **submit & schedule from the review drawer** (reconcile drawer vs profile).
5. **Candidate-facing micro-surface** — self-confirm availability + confirm/propose
   interview time (raises candidate experience from ~1 and feeds availability scoring).
6. **Offer + placement-management stage** — offer status, real start date, a
   placements/worker view (the funnel dead-ends at "hired").
7. **Client free-text channel + persistent client account** across jobs (+ "request a
   new link" when expired).
8. **Proposed interview slots** instead of a bare datetime field (recruiter offers
   times → client picks).
9. **Email actually sending** (Resend) + a **recruiter inbox** of client/candidate replies.
10. **Sourcing-from-LinkedIn enrichment** + **deep links / shareable URLs** to remove
    the last routine browser switches.

---

## Product Scorecard

| Dimension | Score | Rationale |
|---|:--:|---|
| **Recruiter Experience** | **6/10** | Excellent chat copilot + fast core loop; held back by discoverability (submit/schedule), drawer-vs-profile split, hard-coded scheduling, no deep links. |
| **Client Experience** | **5/10** | Clean, trustworthy portal — but WhatsApp unproven, dead "watch" links, confusing time picker, no free-text, no account. |
| **Candidate Experience** | **1/10** | Candidates have no interface, no self-service, no comms, no visibility. They are passive records. |
| **Speed** | **8/10** | Genuinely fast; chat copilot ~83% fewer interactions; matching <0.5s; flat to 500k. |
| **Automation** | **6/10** | Strong async/event design, but every external automation is mocked here; meeting links unprovisioned; offer/onboarding/sourcing manual. |
| **Trust** | **6/10** | Anomaly detection, client-safe boundary, audit log, soft-delete are real strengths; mock meeting/recording links and unconfigured providers actively erode trust in a live setting. |
| **Overall Product Readiness** | **6/10** | A genuinely strong **middle-of-funnel** product and an excellent recruiter copilot — **pilot-ready for the core loop once the real integrations are provisioned.** Not yet a complete system: candidate side absent, offer/placement-management absent, client-WhatsApp unvalidated, mock links break trust. |

---

## 10. Recommended Next Mission

**Mission 7 — "Go-Live Readiness": make the mocks real, close the human-facing gaps,
then run an actual human UAT.**

Concretely, in priority order:
1. Provision **real WhatsApp Business API** (templates + delivery) and **real meeting
   provisioning** (Meet/Zoom) and **real TimeOS** — so the product a human touches is
   real, not mock.
2. Fix the two trust/UX issues that any real user hits in minute one: dead
   "watch/join" links and the hard-coded scheduling date.
3. Add the **candidate micro-surface** and the **offer/placement stage** so a full
   hire is genuinely end-to-end.
4. **Then** run a real human UAT with Lena/Katya and two real clients — which this
   mission has shown is impossible until the above is real.

### Success-criteria assessment
- *"A recruiter can manage an entire hiring process primarily inside ANVI"* —
  **largely yes for the middle of the funnel** (create→match→review→submit→track→
  approve→hire), **no for the ends** (sourcing, the actual calls, offer, onboarding).
- *"A client can manage review primarily through WhatsApp and the portal"* —
  **portal: yes; WhatsApp: unproven** (not provisioned).
- *"Identify the next 10 highest-impact improvements from real usage"* — **done**
  (Section 9), grounded in live runtime behavior, not assumptions.
- *"No code changes during the test"* — **honored.**
