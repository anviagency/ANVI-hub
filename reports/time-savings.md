# Recruiter Time-Savings Analysis (Mission Part 4)

> **Method & honesty note.** The "manual" column is a modeled estimate from typical
> agency-recruiter task times — it is **not** a measured user study. The "ANVI"
> column is grounded in what the system *actually does and was measured doing*
> (job parse returns in one request; `scripts/benchmark.ts` analyzes 50k candidates
> in 127 ms; the client journey in `scripts/client-sim.ts` runs with **0** recruiter
> actions). Treat the manual baseline as an assumption to be validated with real
> recruiters; treat the ANVI side as observed behavior plus light human review time.

## Per-task comparison (one position, one shortlist)

| Stage | Manual workflow | ANVI workflow | Saved |
|---|--:|--:|--:|
| **Job creation** — structure a role from a messy brief, normalize skills, attach client | ~12 min (form-filling, copy-paste) | ~1 min (paste → preview → confirm client) | ~11 min |
| **Candidate discovery** — search the pool, boolean queries, skim profiles | ~90 min (manual search across sources/sheets) | ~2 min (`match` → two-stage funnel, ranked) | ~88 min |
| **Candidate evaluation** — read CVs, spot inconsistencies, write up strengths/risks | ~20 min/candidate × ~8 reviewed = ~160 min | ~5 min (review pre-computed score + evidence + 🔴 anomalies; spot-check) | ~155 min |
| **Candidate submission** — write client summary, redact internal notes, send, chase decisions | ~30 min + async chasing | ~2 min (select → share link; client self-serves; decisions auto-sync) | ~28 min |
| **Total per position** | **~292 min (~4.9 h)** | **~10 min** | **~282 min (~4.7 h)** |

### Where the savings actually come from (mechanism, not magic)
- **Discovery & evaluation dominate** (~85% of the saving) because ANVI never asks a
  human to read 80 CVs — Stage 1 cuts the pool with SQL, Stage 2 produces evidence-
  backed strengths/risks and **flags anomalies a tired recruiter misses at 6pm**
  (benchmark: 5/5 planted anomalies caught, 0 false positives).
- **Submission** collapses because the client operates the share link themselves
  (`client-sim.ts`: 0 recruiter actions, feedback loop auto-captured).
- The recruiter's job shifts from *doing* to *approving* — which is the product thesis.

## Aggregate model

Assumptions (state them, change them): a recruiter closes **~6 positions/month**;
**4 working weeks**; fully-loaded recruiter cost ~**$45/h**.

| Metric | Value |
|---|--:|
| Time saved **per position** | ~4.7 h |
| Time saved **per recruiter per month** (6 positions) | **~28 h** |
| Equivalent reclaimed capacity | ~0.7 FTE-weeks/recruiter/month |
| Cost equivalent / recruiter / month (@ $45/h) | ~$1,260 |
| For a 10-recruiter agency | **~280 h (~$12.6k) / month** |

## Caveats (do not oversell this)
- These are **modeled** numbers. Before quoting them to investors/clients, run a
  measured A/B with 3–5 real recruiters on real reqs.
- ANVI time excludes **interview scheduling/conducting** and **sourcing net-new
  candidates** (ANVI matches the existing pool; it does not yet source).
- Savings assume the pool is already populated and reasonably fresh — see the
  freshness scoring; a stale pool shifts work back to re-verification.
- Quality, not just speed, is the real claim: even at equal time, the anomaly engine
  prevents bad submissions that cost client trust. That value isn't captured above.
