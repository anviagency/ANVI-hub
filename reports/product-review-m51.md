# ANVI — Mission 5.1 Workflow-Closure Report

**Goal:** reduce recruiter tool-switches from **13 → fewer than 5**, measured by one
question: *does this remove a recruiter from another application?*

**Method:** re-ran the Mission 5 lifecycle against the live app
(`scripts/sim-m51.ts`, real HTTP) after the fixes. The closed loop now completes
**entirely in ANVI**:

```
1. Create job (chat)                  ✓ in-platform
2. Add candidate (single intake)      ✓ in-platform — NO Excel
3. Match → candidate found            ✓
4. Schedule screening                 ✓ real meeting link generated — NO Calendar/Zoom setup
   → https://meet.google.com/zes-mvtl-qyz · reminders 24h,1h,10m
5. Submit to client → WhatsApp        ✓ (worker delivered)
6. TimeOS summary → 'screened'        ✓
7. Client APPROVES after screening    ✓ approved  ← the Mission-5 CRITICAL bug, now fixed
8. Move to placement (hired)          ✓ placement created
Result: COMPLETED entirely in ANVI ✅
```

129 tests pass (was 115; +14 incl. the P0 regression + CRUD/intake/scheduling/
availability). Build + TypeScript clean. Migrations up to date.

---

## Priority 0 — the production bug is fixed

`screened → approved` was blocked, the WhatsApp webhook 500'd, and the deduped
retry permanently dropped the client's approval. Fixed three ways, all tested:
1. **Transition table** now allows a client to approve from any post-screening
   stage (`screened`/`sent_to_client`/`interview` → `approved`).
2. **`applyClientDecision` is idempotent** — a duplicate/out-of-order tap on an
   already-settled candidate is a safe no-op (no error, no duplicate timeline event).
3. **Inbound handler releases its idempotency claim on unexpected failure**, so a
   provider retry can reprocess instead of silently dropping the action.
Regression suite: `test/integration/approval-regression.test.ts` (4 tests) +
`pipeline.test.ts` assertions.

---

## Tool-switch scorecard: 13 → 5

| # (M5) | Moment | Before | After 5.1 |
|---|---|---|---|
| 4 | Entering candidate data | **Excel** | **ELIMINATED** — single intake (manual / paste-CV / LinkedIn URL) |
| 6 | Creating the screening meeting | **Zoom/Calendar** | **ELIMINATED** — ANVI generates a Meet/Zoom/Teams link |
| 7 | Sending invites / reminders | **Calendar** | **ELIMINATED** — auto reminders (WhatsApp + email) at 24h/1h/10m |
| 9 | Coordinating client interview time | **Calendly** | **ELIMINATED** — client picks a time in the portal; link generated |
| — | Parallel tracking / fixing mistakes | **Spreadsheet** | **ELIMINATED** — full CRUD (edit/archive/delete/restore) makes ANVI the system of record |
| 3 | Collecting CVs | Email/Drive | **PARTIAL** — paste-CV removes the data entry; receiving the file is still external |
| 5 | Contacting candidates | Telegram/phone | **PARTIAL** — quick-actions launch Call/Email/WhatsApp **and log** the contact + comm-health tracking |
| 1 | Receiving the job brief | Email | remains (no intake inbox) |
| 2 | **Sourcing discovery** | LinkedIn | remains — ANVI adds from LinkedIn URLs but doesn't search external sources |
| 8 | Conducting the call | Zoom/Meet | remains — **inherent** (ANVI makes the link + ingests the summary; it isn't a video platform) |
| 10 | Free-text client questions | WhatsApp/email | remains — buttons + time-picker only |
| 11 | Checking threads | Gmail | remains — no unified inbox |
| 12 | Portfolios | Browser | remains — LinkedIn URL stored, opens externally |
| 13 | Offer / contract | DocuSign | remains — "hired → placement" is in ANVI; the contract isn't |

### The 5 remaining external tools (down from 13)
1. **LinkedIn / browser** — sourcing *discovery* + viewing portfolios.
2. **Video call tool** (Zoom/Meet/Teams) — the actual conversation. *Inherent.*
3. **Email/Gmail** — free-text client/candidate threads (no inbox in ANVI yet).
4. **Contract / e-sign** — offer & onboarding after the hire.
5. **Phone** — actual voice calls (launched + logged from ANVI; the call itself is the phone). *Inherent.*

**Three of the five are inherent** (ANVI cannot *be* a video platform, phone
network, or e-signature vendor). The two genuinely-addressable gaps are
**sourcing discovery** and a **free-text inbox**.

### Measured deltas
- **Recruiter "add a candidate" path:** Mission 5 = build a CSV → upload → map →
  commit (multi-screen, and skill-years landed as 0). Now = one form / one paste,
  **1 API call**, skills carry real years.
- **"Schedule a screening":** Mission 5 = cosmetic (no link). Now = interview +
  **real meeting link** + 3 reminders, **1 call**.
- **"Client books an interview":** Mission 5 = impossible (Calendly). Now = client
  picks a datetime in the portal, **1 public call**, link auto-generated.
- **"Fix a mistake":** Mission 5 = impossible (no edit/delete anywhere). Now =
  edit / archive / soft-delete / restore on candidates, jobs, notes, interviews,
  every change audited + on the timeline, nothing lost.

---

## New capabilities shipped (P1–P5)

- **P1 CRUD** — candidates (edit/archive/soft-delete/restore), jobs (edit/archive/
  restore), notes (edit/delete), interviews (reschedule/cancel). Soft-deleted and
  archived records are excluded from matching and active lists but never destroyed;
  every change writes a timeline event + audit log.
- **P2 Single intake** — `POST /api/candidates` with `mode = manual | cv | linkedin`.
  Paste-CV runs the new CV parser (skills/experience/seniority/country/English);
  LinkedIn stores the URL via a placeholder adapter; source is tracked and shown.
  **Also fixed the Mission-5 data bug:** imports now default per-skill years to the
  candidate's experience instead of 0, so imported candidates are matchable.
- **P3 Real scheduling** — interviews carry date/time/timezone/duration/attendees/
  status/meeting-URL; Meet/Zoom/Teams links are generated; the client picks a time
  from the portal; reschedule/cancel supported; reminders skip cancelled interviews.
- **P4 Communication** — note kinds (call/email/whatsapp/telegram) form a comms
  timeline; one-click quick-actions launch the channel and log the contact;
  communication-health badge (🟢 ≤1d / 🟡 ≤30d / 🔴 30+/never).
- **P5 Availability intelligence** — 0–100 confidence from placement status +
  confirmation/contact/screening recency, shown on the profile and used as a
  ranking signal in matching.
