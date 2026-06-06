# ANVI — Mission 9: Go-Live Execution

Status: **IN PROGRESS — blocked on human-operator provisioning.**
This document is the Phase 5 evidence record. It is written to be filled in *as the
real pilot runs*, and it is honest about what has and has not happened.

---

## 0. Honesty preamble (read first)

Mission 9 is, by design, **not an engineering mission**. Its objective is to prove
ANVI works with **real humans** — a real Meta WhatsApp number sending to a real
phone, a real TimeOS interview, a real email, a real recruiter (Lena), a real
client, a real candidate, and a real placement.

An autonomous coding agent **cannot perform these steps**, and must not pretend to:

- It cannot create or verify a **Meta WhatsApp Business** account, register a real
  phone number, or get message templates approved (a multi-day human/business/Meta
  process requiring a verified business, billing, and review).
- It cannot **send a message to a real phone** or click a button on that phone.
- It cannot sign up for **TimeOS**, obtain a real API key, or run a **real interview
  with real participants**.
- It cannot configure **Resend** with a real verified sending domain, nor confirm a
  human received an email.
- It cannot seat **Lena** (or any recruiter) at a laptop, recruit a **real client**,
  or place a **real candidate**.

Per the mission's own **Rule #1** ("Assumptions are no longer valid. Only real user
behavior matters.") and ANVI's standing principle ("Prove, don't pad. … runtime
proof, not a green test."), **fabricating pilot findings would be the single worst
possible outcome.** This report therefore contains **zero invented results.** Where a
section requires real-world data, it is explicitly marked **PENDING REAL PILOT** with
the exact procedure and measurement plan for the human operator.

**What the agent *can* and *did* do (verifiable, code-level):** confirm that the
codebase is genuinely **provisioning-ready** — that supplying real keys flips each
provider from mock to real with no code change — and produce the operator runbook
and verification checklist below.

---

## 1. Provider readiness audit (verified by code inspection)

All three providers follow the same interface-first pattern: a mock default, and a
real implementation that activates **only** when credentials are present. Confirmed
in source:

| Provider | Activates when | Mock→real switch | Real implementation | Webhook |
|---|---|---|---|---|
| **WhatsApp (Meta)** | `WHATSAPP_ACCESS_TOKEN` **and** `WHATSAPP_PHONE_NUMBER_ID` set | `getWhatsAppProvider()` (`src/lib/whatsapp/provider.ts:164`) | `MetaWhatsAppProvider` → Graph API `v21.0` (template / interactive / text) | `GET/POST /api/webhooks/whatsapp` (verify handshake + inbound) |
| **TimeOS** | `TIMEOS_API_KEY` set (`TIMEOS_API_BASE` optional, default `https://api.timeless.day`) | `getMeetingProvider()` (`src/lib/meetings/provider.ts:128`) | `TimeOsProvider.fetchMeetingSummary` + `parseTimeOsSummary` | `POST /api/webhooks/timeos` (idempotent via `WebhookEvent`) |
| **Email (Resend)** | `RESEND_API_KEY` set (`EMAIL_FROM` optional) | `emailConfigured()` / `sendEmail()` (`src/lib/email/provider.ts`) | Resend `POST https://api.resend.com/emails` | n/a (outbound only) |

Supporting facts verified:
- Outbound WhatsApp/email run on the **background worker** (`wa_send`,
  `interview_reminder`), never on the request path — so provisioning does not change
  request latency.
- Inbound WhatsApp is **idempotent** (unique `(provider, externalId)` in
  `WebhookEvent`); a re-delivered Meta webhook is a no-op.
- The webhook **verify handshake** echoes `hub.challenge` when
  `hub.verify_token === WHATSAPP_VERIFY_TOKEN` (default `anvi-dev-verify` — must be
  overridden for production).
- TimeOS summary ingestion already wires recording/summary/action-items →
  interview → timeline → pipeline `screened` → client "screening completed"
  notification (end-to-end on mocks; ready for the real payload).
- Mission 8's no-fake-link rule means that **until** `TIMEOS_API_KEY` is set, client
  surfaces correctly show "Recording not ready yet" rather than a dead link.

**Conclusion:** the system is **provisioning-ready**. No code change is required to
activate real providers — only credentials, a public webhook URL, and (for WhatsApp)
template approval.

### 1a. Two readiness caveats the operator MUST know (verified)

1. **WhatsApp inbound webhook does not verify `X-Hub-Signature-256`.** The POST
   handler (`/api/webhooks/whatsapp`) is idempotent and rate-limited but does not
   validate Meta's payload signature against the app secret. Before exposing the
   webhook on the public internet, signature verification should be enforced. *(This
   is a pre-existing production hardening item, not new work — logged under Trust
   blockers; do not fix mid-mission unless the pilot is blocked by it.)*
2. **`MEETING_ROOMS_API_KEY` is NOT a real meeting-room integration.** It only gates
   link *generation*; if set, ANVI will emit a real-*shaped* `meet.google.com` URL
   and mark it `provisioned=true` — which is **not** a real booked room. **Do not set
   `MEETING_ROOMS_API_KEY` for the pilot.** Instead, have the recruiter paste a real
   Zoom/Meet link when scheduling (already supported). This key is also currently
   undocumented in `.env.example`.

---

## 2. Phase 1 — Provider provisioning runbook (operator actions)

These are the steps a **human operator** must perform. Each maps to a mission
deliverable and a verification that can be confirmed inside ANVI (the audit log,
`Notification`, and `WaMessage` tables record everything).

### 2.1 WhatsApp Business API
1. Create/verify a **Meta Business** account; add the **WhatsApp** product.
2. Register a **real phone number**; capture the **Phone Number ID**.
3. Generate a permanent **system-user access token** with `whatsapp_business_messaging`.
4. Submit and get **template approval** for the lifecycle messages (candidate
   submitted, screening completed, pending feedback, interview reminder).
5. Set env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_VERIFY_TOKEN` (a strong random value).
6. Configure the Meta webhook to `https://<public-host>/api/webhooks/whatsapp` using
   the same verify token; subscribe to `messages`.
7. (Recommended) enforce `X-Hub-Signature-256` verification before going public.

**Deliverable / verification (send a real message to a real phone):**
- [ ] Submit a candidate → recipient phone **receives** the WhatsApp message.
- [ ] Message shows **delivered** (Meta status) and a `WaMessage` row `status=sent`.
- [ ] Recipient taps **Approve/Reject/Interview** → inbound webhook fires.
- [ ] ANVI records the decision (pipeline stage change + `client_*` timeline event +
      audit row); response confirmed.

### 2.2 TimeOS
1. Obtain a real **TimeOS API key**; confirm the API base.
2. Set env: `TIMEOS_API_KEY` (+ `TIMEOS_API_BASE` if non-default).
3. Configure TimeOS to POST summaries to
   `https://<public-host>/api/webhooks/timeos`.
4. Schedule a **real interview**, tagging it with the meeting tag ANVI generated.

**Deliverable / verification (run a real interview):**
- [ ] After the call, the TimeOS webhook delivers a summary.
- [ ] Interview row gains **recording**, **summary**, **action items**, participants.
- [ ] Pipeline advances to **screened**; client gets the "screening completed"
      message with a **real** recording link (no longer "not ready").

### 2.3 Email (Resend)
1. Create a Resend account; **verify the sending domain**; get the API key.
2. Set env: `RESEND_API_KEY`, `EMAIL_FROM` (a verified-domain address).

**Deliverable / verification (real email received):**
- [ ] Trigger an interview reminder → recipient **receives** the email.
- [ ] `Notification` row `channel=email status=sent`.

---

## 3. Phases 2–4 — Real pilots (PENDING REAL PILOT)

These phases require real humans and cannot be executed or simulated by the agent.
Below is the run protocol and the data each phase must capture. **Do not fill these
with assumptions** — only with observations from the real run.

### Phase 2 — Real recruiter pilot (Lena, real position, real candidates)
Protocol: give Lena a real open role and ask her to run it in ANVI with no help or
script. Capture, live:
- recruiter feedback (verbatim) · confusion points (where she stalls) · time spent
  per step · external tools she still opens · functionality she expected but couldn't
  find.

### Phase 3 — Real client pilot (one client, one position, real shortlist)
The client must receive: WhatsApp, a share link, interview scheduling, and approve
candidates. Capture: response rate · approval rate · confusion points · support
requests.

### Phase 4 — First real placement (one complete hire)
Run Job → Match → Screening → Client review → Interview → Approval → Offer →
Placement → Start date. Document **every failure, every manual step, every external
tool** as it happens.

> ANVI already instruments most of this: the **audit log**, **`Notification`**,
> **`WaMessage`**, **`CandidateEvent`** timeline, and **`ClientMessage`** tables are
> the evidence source — harvest them after the run rather than relying on memory.

---

## 4. Phase 5 — Evidence collection

### Recruiter Findings
**PENDING REAL PILOT** (Phase 2). Capture template:
- Time to first shortlist: ___ · Total clicks: ___ · Screens visited: ___
- Confusion points: ___ · External tools used: ___ · Missing functionality: ___

### Client Findings
**PENDING REAL PILOT** (Phase 3). Capture template:
- WhatsApp received? ___ · Response rate: ___ · Approval rate: ___
- Confusion points: ___ · Support requests: ___

### Candidate Findings
**PENDING REAL PILOT** (Phase 3/4). Capture template:
- Confirmed availability via `/c/:token`? ___ · Confirmed/declined interview? ___
- Confusion points: ___

### Provider Findings (partial — code-level, verified now)
- WhatsApp / TimeOS / Email: **provisioning-ready**, mock→real on keys, no code change (see §1). **Real delivery: PENDING** operator provisioning (§2).
- **Caveat 1:** WhatsApp webhook does not verify `X-Hub-Signature-256` (§1a).
- **Caveat 2:** `MEETING_ROOMS_API_KEY` fabricates shaped links — leave unset; have the recruiter paste a real link (§1a).
- Live delivery metrics (delivered/received/clicked, summary ingested, email opened): **PENDING REAL PILOT**.

### Bugs Found
**PENDING REAL PILOT.** None can be claimed without a real run. (Pre-existing,
non-pilot-blocking hardening items are tracked in §5 and in
`reports/pilot-readiness-m8.md`.)

### Missing Features
**PENDING REAL PILOT.** Per Rule #1, no feature gaps are asserted until real usage
exposes them. (Known-by-design gaps from M8: real meeting-room booking, recruiter
inbox, LinkedIn sourcing — do **not** build unless the pilot proves the need.)

### Unexpected User Behavior
**PENDING REAL PILOT.** This section exists specifically to record surprises from
real humans — the highest-value output of the mission. Leave empty until observed.

### Top 10 Improvements
Until the real pilot runs, the only honestly-rankable items are the **provisioning
and hardening** steps that unblock it (engineering/ops, not user-driven features):
1. Provision **WhatsApp Business API** + template approval (Critical).
2. Stand up a **public HTTPS host** + the WhatsApp & TimeOS webhooks (Critical).
3. Enforce **`X-Hub-Signature-256`** before exposing the WhatsApp webhook (Trust).
4. Provision **TimeOS** key + webhook (High).
5. Provision **Resend** (domain verify + key) (High).
6. Set a strong **`WHATSAPP_VERIFY_TOKEN`** (replace the dev default) (Trust).
7. Document **`MEETING_ROOMS_API_KEY`** caveat in `.env.example`; keep it unset (Medium).
8. Run a **worker supervisor / health check** for the background queue in prod (Medium).
9. Move **rate limiting to Redis** before running >1 node (Medium).
10. Pre-stage the **evidence harvest** (queries over audit log / `WaMessage` /
    `Notification` / timeline) so Phase 2–4 findings are captured, not recalled (Medium).

*(Items 1–10 here are deliberately ops/hardening, not new product features, in
keeping with "do not build anything new." A real, user-driven Top 10 will replace
this list after the pilot.)*

---

## 5. Blockers (ranked)

### Critical (block the mission entirely)
- **No real provider credentials.** WhatsApp, TimeOS, and Email are unprovisioned;
  every success criterion depends on them. **Owner: human operator.** Not solvable by
  the agent.
- **No public host + webhooks.** Meta and TimeOS must reach ANVI over HTTPS.
- **No real humans engaged.** Lena, a real client, and a real candidate are required;
  the agent cannot supply them.

### High
- TimeOS / Email provisioning (above) — needed for the "screening magic" and email
  reach.

### Medium / Trust (pre-existing; harden before/around go-live, do not fix mid-mission unless blocking)
- WhatsApp webhook signature verification (`X-Hub-Signature-256`).
- `WHATSAPP_VERIFY_TOKEN` still the dev default in `.env.example`.
- `MEETING_ROOMS_API_KEY` link-fabrication caveat (leave unset).
- In-memory rate limiting; single worker without supervisor/alerting; no security
  headers; sessions not globally revocable. (See `reports/pilot-readiness-m8.md` §5.)

---

## 6. Success-criteria status (honest)

| Criterion | Status | Why |
|---|---|---|
| ✅ Real WhatsApp works | ⛔ **PENDING** | needs a provisioned Meta account + real phone (agent cannot do) |
| ✅ Real TimeOS works | ⛔ **PENDING** | needs a real key + a real interview |
| ✅ Real Email works | ⛔ **PENDING** | needs Resend domain + key |
| ✅ Real recruiter uses ANVI | ⛔ **PENDING** | needs Lena |
| ✅ Real client reviews candidates | ⛔ **PENDING** | needs a real client |
| ✅ Real candidate confirms availability | ⛔ **PENDING** | needs a real candidate |
| ✅ Real placement completed | ⛔ **PENDING** | needs the above chain |
| Codebase provisioning-ready | ✅ **VERIFIED** | mock→real on keys, no code change (§1) |

**Mission 9 cannot be marked complete by the agent.** The engineering precondition —
a system that flips to real providers with zero code change and never shows fake data
in the meantime — is **met and verified**. The remaining work is **operational**:
provision the providers (§2), then run the real pilots (§3) and fill §4 with real
observations.

---

## 7. Recommended next action (for the human operator)

1. Provision the three providers per §2 and tick each verification box.
2. Run Phase 2 → 3 → 4 with Lena, one real client, and one real candidate.
3. Return here and replace every **PENDING REAL PILOT** block with real data.
4. Only **after the first real placement** decide Mission 10 — driven by what the
   pilot exposed, not by assumptions (per the mission's closing instruction).
