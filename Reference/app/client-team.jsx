// ANVI Client Portal — team, interviews, payroll & calendar data (June 2026)

// ---- Country calendar facts for June 2026 (30 days, starts Monday) ----
// weekdays in June 2026 = 22; subtract weekday public holidays.
const COUNTRY_CAL = {
  Ukraine:   { flag: "🇺🇦", weekdays: 22, holidays: [{ d: 28, name: "Constitution Day", weekend: true }], working: 22 },
  Poland:    { flag: "🇵🇱", weekdays: 22, holidays: [{ d: 4, name: "Corpus Christi" }], working: 21 },
  Estonia:   { flag: "🇪🇪", weekdays: 22, holidays: [{ d: 23, name: "Victory Day" }, { d: 24, name: "Midsummer Day" }], working: 20 },
  Romania:   { flag: "🇷🇴", weekdays: 22, holidays: [{ d: 1, name: "Children's Day" }, { d: 8, name: "Whit Monday" }], working: 20 },
  Portugal:  { flag: "🇵🇹", weekdays: 22, holidays: [{ d: 4, name: "Corpus Christi" }, { d: 10, name: "Portugal Day" }], working: 20 },
  Argentina: { flag: "🇦🇷", weekdays: 22, holidays: [{ d: 15, name: "Güemes Day (obs.)" }, { d: 20, name: "Flag Day", weekend: true }], working: 21 },
  Czechia:   { flag: "🇨🇿", weekdays: 22, holidays: [], working: 22 },
};

// month grid for June 2026 — index 0 = Mon. returns weeks of {d, dow}
function juneGrid() {
  // June 1 2026 is Monday (dow 0 in Mon-first)
  const days = 30, firstDow = 0;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
function isWeekend(d) { const dow = (d - 1) % 7; return dow === 5 || dow === 6; } // Sat=5,Sun=6 (Mon-first)

// ---- Hired employees (recruited through ANVI, now on the client's team) ----
const TEAM = [
  {
    id: "e-artem", name: "Artem Valkov", role: "Senior Full-Stack Developer",
    initials: "AV", flag: "🇺🇦", country: "Ukraine", city: "Kyiv", tz: "EET (UTC+2)",
    started: "Mar 3, 2026", tenure: "3 months", status: "Active",
    rate: 34, hoursMonth: 168, monthly: 5712, contract: "Outstaff · Full-time", notice: "30 days",
    payTerms: "Monthly · Net-5 · USD wire", nextPay: "Jun 30, 2026",
    vacation: { annual: 24, used: 5, pending: 0, balance: 19 },
    paidLeavePolicy: "24 working days / year · 10 paid sick days",
    upcoming: null,
    avatarTone: "a",
  },
  {
    id: "e-elena", name: "Elena Costa", role: "Product Designer",
    initials: "EC", flag: "🇷🇴", country: "Romania", city: "Cluj", tz: "EET (UTC+2)",
    started: "Jan 15, 2026", tenure: "5 months", status: "On vacation",
    rate: 36, hoursMonth: 160, monthly: 5760, contract: "Outstaff · Part-time 0.8", notice: "30 days",
    payTerms: "Monthly · Net-5 · USD wire", nextPay: "Jun 30, 2026",
    vacation: { annual: 24, used: 11, pending: 0, balance: 13 },
    paidLeavePolicy: "24 working days / year · 10 paid sick days",
    upcoming: { type: "Vacation", range: "Jun 16 – Jun 20", days: 5, status: "Approved" },
    avatarTone: "b",
  },
  {
    id: "e-mira", name: "Mira Antonova", role: "ML Engineer (LLM / RAG)",
    initials: "MA", flag: "🇪🇪", country: "Estonia", city: "Tallinn", tz: "EET (UTC+2)",
    started: "Apr 21, 2026", tenure: "6 weeks", status: "Active",
    rate: 54, hoursMonth: 160, monthly: 8640, contract: "Outstaff · Full-time", notice: "30 days",
    payTerms: "Monthly · Net-5 · USD wire", nextPay: "Jun 30, 2026",
    vacation: { annual: 28, used: 0, pending: 3, balance: 25 },
    paidLeavePolicy: "28 working days / year · 10 paid sick days",
    upcoming: { type: "Vacation", range: "Jul 7 – Jul 9", days: 3, status: "Pending ANVI" },
    avatarTone: "c",
  },
];

// ---- Activity / report log per employee (client ⇄ ANVI ⇄ employee) ----
const TEAM_LOG = {
  "e-artem": [
    { who: "employee", icon: "sun", text: "Artem reported 1 sick day (Jun 2) — covered by paid sick leave.", when: "2 days ago", status: "Logged" },
    { who: "anvi", icon: "wallet", text: "May invoice settled — $5,712.", when: "May 31", status: "Paid" },
  ],
  "e-elena": [
    { who: "client", icon: "plane", text: "You approved Elena's vacation Jun 16–20 (5 days).", when: "1 week ago", status: "Approved" },
    { who: "employee", icon: "message", text: "Elena shared the Q3 design-system handoff doc.", when: "4 days ago", status: "Shared" },
  ],
  "e-mira": [
    { who: "employee", icon: "plane", text: "Mira requested vacation Jul 7–9 (3 days).", when: "Yesterday", status: "Pending ANVI" },
    { who: "anvi", icon: "check", text: "Onboarding complete — equipment & access confirmed.", when: "Apr 25", status: "Done" },
  ],
};

// ---- Interviewed candidates with dual video recordings ----
// Each has the ANVI screening interview (recorded by us) + the client's own interview.
const INTERVIEWS = [
  {
    id: "i-artem", name: "Artem Valkov", role: "Senior Full-Stack Developer",
    initials: "AV", flag: "🇺🇦", country: "Ukraine", match: 86, rate: 34,
    outcome: "Hired", outcomeTone: "good", reviewed: "Hired Mar 3",
    videos: [
      { kind: "anvi", title: "ANVI Screening Interview", by: "Daria Levin · ANVI", dur: "18:42", recorded: "Feb 24, 2026", chapters: ["Background", "React / Next.js deep-dive", "System design", "AI workflow"],
        summary: "Strong, structured communicator. Walked through a multi-tenant SaaS he built end-to-end. Clear on trade-offs. English B2, very comfortable." },
      { kind: "client", title: "Your Technical Interview", by: "You · Northwind SaaS", dur: "44:10", recorded: "Feb 27, 2026", chapters: ["Intro", "Live coding", "Architecture", "Team fit"],
        summary: "Live-coded a debounced search with clean state handling. Asked great product questions. Team-fit positive." },
    ],
    intel: {
      recommendation: "Strong hire. Technical depth and communication both land in the top band. The only minor gap — explicit Claude Code experience — is low-risk given his daily Cursor + Copilot use.",
      scores: [["Technical skill", 88], ["Communication", 85], ["Culture fit", 90], ["English (B2)", 78]],
      moments: [
        { t: "06:12", v: "ANVI screening", topic: "Multi-tenant architecture", quote: "Explained row-level tenancy and where he'd cache — clear trade-off reasoning." },
        { t: "11:48", v: "Your interview", topic: "Live coding", quote: "Built a debounced search with clean state separation, no prompting." },
        { t: "31:05", v: "Your interview", topic: "Product thinking", quote: "Proactively raised edge cases around onboarding and empty states." },
      ],
    },
  },
  {
    id: "i-olek", name: "Oleksandr Hrytsenko", role: "Senior Software Engineer",
    initials: "OH", flag: "🇺🇦", country: "Ukraine", match: 84, rate: 38,
    outcome: "On hold", outcomeTone: "warn", reviewed: "Decision pending",
    videos: [
      { kind: "anvi", title: "ANVI Screening Interview", by: "Daria Levin · ANVI", dur: "21:05", recorded: "Feb 25, 2026", chapters: ["Background", "AWS & GraphQL", "Claude Code workflow", "Availability"],
        summary: "C1 English, excellent client-facing presence. Deep AWS + GraphQL. 1-month notice period is the only friction." },
      { kind: "client", title: "Your Technical Interview", by: "You · Northwind SaaS", dur: "38:52", recorded: "Mar 1, 2026", chapters: ["Intro", "Architecture", "Live debugging", "Q&A"],
        summary: "Very polished. Slightly over budget at $38/hr. Strong backup if Artem hadn't accepted." },
    ],
    intel: {
      recommendation: "Excellent candidate kept on hold for budget. Best-in-pool English and AWS depth. Re-engage first for the next senior full-stack or platform role.",
      scores: [["Technical skill", 86], ["Communication", 94], ["Culture fit", 82], ["English (C1)", 95]],
      moments: [
        { t: "08:30", v: "ANVI screening", topic: "AWS & GraphQL", quote: "Walked through a federated GraphQL setup and where it broke at scale." },
        { t: "14:20", v: "ANVI screening", topic: "Claude Code workflow", quote: "Showed a real AI-assisted refactor from his current role." },
        { t: "27:40", v: "Your interview", topic: "Availability", quote: "1-month notice was the only friction — everything else aligned." },
      ],
    },
  },
  {
    id: "i-sofia", name: "Sofia Marin", role: "Frontend-leaning Full-Stack",
    initials: "SM", flag: "🇦🇷", country: "Argentina", match: 81, rate: 32,
    outcome: "Passed", outcomeTone: "bad", reviewed: "Passed Mar 2",
    videos: [
      { kind: "anvi", title: "ANVI Screening Interview", by: "Daria Levin · ANVI", dur: "16:30", recorded: "Feb 24, 2026", chapters: ["Background", "Next.js + TS", "Product sense", "Timezone"],
        summary: "Great Next.js + TypeScript depth, US-friendly timezone. Back-end lighter than the role needed." },
      { kind: "client", title: "Your Technical Interview", by: "You · Northwind SaaS", dur: "29:14", recorded: "Feb 28, 2026", chapters: ["Intro", "Portfolio", "Live coding", "Fit"],
        summary: "Strong front-end. Decided to prioritise back-end depth for this hire — kept warm for future roles." },
    ],
    intel: {
      recommendation: "Passed for this role only — back-end was lighter than required. Outstanding front-end and product sense with US-friendly hours; ideal for a future frontend-heavy or design-engineering role.",
      scores: [["Technical skill", 81], ["Communication", 88], ["Culture fit", 86], ["English (B2+)", 84]],
      moments: [
        { t: "09:05", v: "ANVI screening", topic: "Next.js + TypeScript", quote: "Deep on app-router patterns and type-safe data fetching." },
        { t: "16:30", v: "Your interview", topic: "Portfolio", quote: "Showed polished, accessible UI work with strong attention to detail." },
        { t: "22:10", v: "Your interview", topic: "Back-end depth", quote: "Honest that her back-end is lighter — comfortable but not specialist." },
      ],
    },
  },
];

// ---- Upcoming scheduled interviews (the interview calendar) ----
const UPCOMING_INTERVIEWS = [
  { id: "u-dmytro", name: "Dmytro Koval", initials: "DK", flag: "🇵🇱", role: "Full-Stack Engineer",
    dateISO: "2026-06-05T16:00:00", durationMin: 45, type: "Technical interview", mode: "Google Meet",
    withWho: "You + Daria (ANVI)", joinUrl: "https://meet.google.com/anvi-dmytro" },
  { id: "u-nadia", name: "Nadia Volkova", initials: "NV", flag: "🇺🇦", role: "Backend Engineer",
    dateISO: "2026-06-09T11:30:00", durationMin: 30, type: "Intro call", mode: "Zoom",
    withWho: "Daria (ANVI)", joinUrl: "https://zoom.us/j/anvi-nadia" },
  { id: "u-sofia", name: "Sofia Marin", initials: "SM", flag: "🇦🇷", role: "Frontend-leaning Full-Stack",
    dateISO: "2026-06-09T15:00:00", durationMin: 45, type: "Culture & product fit", mode: "Google Meet",
    withWho: "You", joinUrl: "https://meet.google.com/anvi-sofia" },
  { id: "u-tomas", name: "Tomas Reuben", initials: "TR", flag: "🇨🇿", role: "DevOps Engineer",
    dateISO: "2026-06-12T17:00:00", durationMin: 60, type: "System design", mode: "Google Meet",
    withWho: "You + Daria (ANVI)", joinUrl: "https://meet.google.com/anvi-tomas" },
];

window.CLIENT_TEAM = { COUNTRY_CAL, juneGrid, isWeekend, TEAM, TEAM_LOG, INTERVIEWS, UPCOMING_INTERVIEWS };
