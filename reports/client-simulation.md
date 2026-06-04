# Client Experience Simulation

_Drives the real public share surface (`src/lib/share.ts`) end to end._

Recruiter setup done. Share link: `/share/q5bCffFs6izwoUZlWAHxOFysYSqZIxd7` (3 candidates).
**From here, no recruiter touches the system.**

## Client opens the link
Client sees **3** candidates for *CSIM Senior Full-Stack*:
- **CSIM Candidate A** — Ukraine, C1, $34/hr · match 94 (strong) · 5 strengths, 0 risks · notes visible: 1
- **CSIM Candidate B** — Ukraine, B2+, $32/hr · match 94 (strong) · 4 strengths, 0 risks · notes visible: 0
- **CSIM Candidate C** — Ukraine, B2, $30/hr · match 85 (strong) · 4 strengths, 1 risks · notes visible: 0

### Boundary checks (what the client must NOT see)
- Internal note leaked: ✅ no
- Internal cost leaked: ✅ no
- Raw anomalies leaked: ✅ no

## Client makes decisions (in the link, no calls/emails)
- Approves **Candidate A** → pipeline now `approved`
- Requests interview with **Candidate B** → pipeline now `interview`
- Passes on **Candidate C** (reason captured) → pipeline now `rejected`

## Recruiter side updated automatically
- Candidate A: stage `approved`, client status `approved`
- Candidate B: stage `interview`, client status `pending`
- Candidate C: stage `rejected`, client status `rejected`, feedback: "Not enough SaaS depth"

## Verdict
- **Recruiter actions during client phase:** 0 ✅ (zero-touch achieved)
- **Client-driven events recorded:** 6
- **Notifications fired to recruiter/Telegram:** 7
- **Feedback loop closed (rejection reason captured):** ✅

**Result: client operated the full pipeline with zero recruiter involvement and no internal-data leakage.**
