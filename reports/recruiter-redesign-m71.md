# ANVI — Mission 7.1: Recruiter Experience Redesign

Goal: turn the Recruiter Copilot from a command line into a **conversational
recruiting partner** with a **Job Workspace** as the operational center, built on
the existing backend (no new infrastructure/integrations/DB beyond two job fields).

## Part 1 — Real conversational job creation (live transcript)

```
👤 Need a Senior Python Developer. AWS. React advantage.
🤖 What's the target budget? (e.g. $30–45/hr)
👤 $45-60/hr
🤖 Is this remote, hybrid, or onsite?   [Remote / Hybrid / Onsite]
👤 remote
🤖 Full-time, part-time, or contract?    [Full-time / Part-time / Contract]
👤 full time
🤖 What English level is required? (e.g. B2, C1, fluent)
👤 C1
🤖 Last thing — which client is this for?
👤 Andy
🤖 Found existing client Northwind SaaS. Attach this position to them?  [Yes / Different client]
👤 yes
🤖 Done — Senior Python Developer for Northwind SaaS is live. I've opened its
    workspace; say "match" and I'll start sourcing candidates.
```

- The AI **identifies missing fields and asks for one at a time** (budget → work
  mode → employment type → English → client). It only asks for what's actually
  missing — "Good English"/"Senior" already in the brief are not re-asked.
- **Client resolution with buttons:** found → "Attach to Northwind?" [Yes /
  Different client]; not found → "Create it as a new client?" [Create client /
  Search again].
- State is carried across turns via `context.pendingJob`; the chat route detects a
  mid-intake turn and keeps gathering instead of re-classifying the answer.
- Implementation: `src/lib/chat/intake.ts` (slot-filling state machine),
  `ChatView` renders the questions + buttons + the "Open workspace" card.

## Part 2 — Job Workspace (the command center)

`GET /api/jobs/:id/workspace` returns everything in one call; the page renders:
- **Overview** — position, client, budget, work mode, employment type, English,
  experience, created date, skills, status.
- **Candidate summary counts** — matching / submitted / interviewed / approved / placed.
- **Visual pipeline** — New → Screening → Submitted → Interview → Approved → Placed
  with live counts.
- **Top candidates** — immediately visible: match score, availability score, country,
  rate, key strengths/risks, anomalies (click → full profile).
- **Client activity** — last client action, pending approvals, share links + view counts.
- **Interview history** — status, summaries, recordings, join links.
- **Recruiter notes**.

Reached from the "Open workspace" card after creation, and by clicking any card in
Vacancies. Live proof:
```
overview: Senior Python Developer | remote · full_time | $45-60/hr | Northwind SaaS | C1
top: Mira Antonova 91 (avail 70%), Yuki Tanaka 82 (avail 70%)
```

## Part 3 — AI assistant inside the job

Every workspace has its own AI panel (`JobAIPanel`) scoped to the role — it calls
`/api/chat` with the job in context, so the recruiter can ask in place:
"explain why these ranked highest", "who is the safest candidate?", "compare the
top 3", "only candidates with strong English". Live:
```
👤 (in workspace) explain why these ranked highest
🤖 Here's why the top 2 ranked highest… top reasons: Skill coverage (+62) — 100% of
   required; Seniority (+6) — 7y career
```

## Part 4 — Proactive AI suggestions

`GET /api/jobs/:id/suggestions` surfaces nudges without being asked. Live:
```
[action] You have 2 strong candidates not submitted yet.
[info]   2 candidates meet all key requirements out of 2 analyzed.
```
Also detects: client hasn't reviewed pending candidates in N days; candidates with
stale availability; missing salary range; no candidates matched yet.

## Part 5 — UX principles

The AI is never silent (it always proposes the next step), never requires
remembering commands (it asks questions and offers buttons), and actively drives
the process forward (suggestions + "say match and I'll start sourcing").

## Verification

- New tests: `test/integration/workspace-intake.test.ts` (multi-turn intake,
  client-create branch, workspace endpoint, suggestions). **149 tests pass**.
- `tsc --noEmit` clean · `next build` compiles · migrations up to date.
- One small migration: `Job.workMode` + `Job.employmentType` (product fields the
  workspace displays) — gathered conversationally.

## What this changes about the feel

Before: paste → get a card → remember "match". After: a guided conversation that
ends in a live role and a dedicated workspace, with the AI proactively pointing at
the next action. It now reads closer to **ChatGPT managing recruitment** than an ATS
with a chat box attached.
