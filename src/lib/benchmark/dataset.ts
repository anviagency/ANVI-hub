// Labeled benchmark dataset for the matching validation (mission Part 2).
// Each candidate carries GROUND-TRUTH labels (`matches`) — the scenarios a human
// recruiter would consider this person a genuine hire for — plus an optional
// `planted` anomaly. Accuracy is measured against these labels.

export type ScenarioKey = "A" | "B" | "C" | "D";

export interface BenchScenario {
  key: ScenarioKey;
  title: string;
  experienceYearsMin: number;
  englishLevel: string;
  budgetMax: number;
  skills: { name: string; required: boolean; minYears?: number | null }[];
}

export const SCENARIOS: BenchScenario[] = [
  {
    key: "A",
    title: "Senior Python Developer",
    experienceYearsMin: 5,
    englishLevel: "B2+",
    budgetMax: 50,
    skills: [
      { name: "Python", required: true, minYears: 5 },
      { name: "FastAPI", required: true, minYears: null },
      { name: "PostgreSQL", required: true, minYears: 2 },
      { name: "Django", required: false },
      { name: "AWS", required: false },
    ],
  },
  {
    key: "B",
    title: "React Team Lead",
    experienceYearsMin: 6,
    englishLevel: "C1",
    budgetMax: 60,
    skills: [
      { name: "React", required: true, minYears: 5 },
      { name: "TypeScript", required: true, minYears: 3 },
      { name: "Next.js", required: false },
      { name: "Node.js", required: false },
    ],
  },
  {
    key: "C",
    title: "DevOps Engineer",
    experienceYearsMin: 5,
    englishLevel: "B2+",
    budgetMax: 55,
    skills: [
      { name: "Docker", required: true, minYears: 3 },
      { name: "Kubernetes", required: true, minYears: 2 },
      { name: "AWS", required: true, minYears: 3 },
      { name: "Microservices", required: false },
    ],
  },
  {
    key: "D",
    title: "Full Stack SaaS Developer",
    experienceYearsMin: 5,
    englishLevel: "B2+",
    budgetMax: 45,
    skills: [
      { name: "React", required: true, minYears: 4 },
      { name: "Node.js", required: true, minYears: 3 },
      { name: "PostgreSQL", required: true, minYears: 2 },
      { name: "SaaS", required: false },
    ],
  },
];

export interface BenchEmp {
  company: string;
  fullTime?: boolean;
  start: [number, number];
  end?: [number, number] | null;
}

export interface BenchCandidate {
  key: string;
  name: string;
  country: string;
  englishLevel: string;
  clientRate: number;
  availability?: "available" | "on_hold" | "placed";
  careerStartYear: number;
  totalYears: number;
  updatedDaysAgo: number;
  contactedDaysAgo?: number;
  email?: string | null;
  linkedinTitle?: string;
  title?: string;
  skills: { name: string; years: number }[];
  employments?: BenchEmp[];
  /** Ground truth: scenarios this candidate is a genuine match for. */
  matches: ScenarioKey[];
  /** Ground truth: planted anomaly type (engine should flag it). */
  planted?: string;
}

const py = (years: number) => [
  { name: "Python", years },
  { name: "FastAPI", years: Math.max(1, years - 1) },
  { name: "PostgreSQL", years: Math.max(1, years - 2) },
];

export const BENCH_CANDIDATES: BenchCandidate[] = [
  // ---- Scenario A: Senior Python ----
  { key: "A1", name: "Pyotr Senior", country: "Poland", englishLevel: "C1", clientRate: 44, careerStartYear: 2016, totalYears: 9, updatedDaysAgo: 3, skills: [...py(8), { name: "Django", years: 5 }, { name: "AWS", years: 4 }], matches: ["A"] },
  { key: "A2", name: "Pia Backend", country: "Spain", englishLevel: "B2+", clientRate: 38, careerStartYear: 2018, totalYears: 7, updatedDaysAgo: 10, skills: [...py(6)], matches: ["A"] },
  { key: "A3", name: "Pavlo Data", country: "Ukraine", englishLevel: "B2", clientRate: 33, careerStartYear: 2019, totalYears: 6, updatedDaysAgo: 20, skills: [{ name: "Python", years: 6 }, { name: "FastAPI", years: 3 }, { name: "Airflow", years: 3 }], matches: ["A"] },
  // Python but UNDER experience (junior) — should rank low / not in shortlist.
  { key: "A4", name: "Junior Py", country: "Brazil", englishLevel: "B2", clientRate: 22, careerStartYear: 2024, totalYears: 2, updatedDaysAgo: 5, skills: [{ name: "Python", years: 2 }, { name: "FastAPI", years: 1 }, { name: "PostgreSQL", years: 1 }], matches: [] },

  // ---- Scenario B: React Team Lead ----
  { key: "B1", name: "Rita Lead", country: "Portugal", englishLevel: "C1", clientRate: 52, careerStartYear: 2015, totalYears: 10, updatedDaysAgo: 2, title: "Frontend Lead", skills: [{ name: "React", years: 9 }, { name: "TypeScript", years: 7 }, { name: "Next.js", years: 5 }, { name: "Node.js", years: 6 }], employments: [{ company: "LeadCo", start: [2019, 1] }, { company: "WebCo", start: [2015, 1], end: [2018, 12] }], matches: ["B"] },
  { key: "B2", name: "Ren Frontend", country: "Estonia", englishLevel: "C1", clientRate: 48, careerStartYear: 2016, totalYears: 9, updatedDaysAgo: 14, skills: [{ name: "React", years: 8 }, { name: "TypeScript", years: 6 }, { name: "Next.js", years: 4 }], matches: ["B"] },
  // React but weak English for a client-facing lead — borderline.
  { key: "B3", name: "Roman Quietlead", country: "Ukraine", englishLevel: "B1", clientRate: 40, careerStartYear: 2017, totalYears: 8, updatedDaysAgo: 30, skills: [{ name: "React", years: 7 }, { name: "TypeScript", years: 5 }], matches: [] },

  // ---- Scenario C: DevOps ----
  { key: "C1", name: "Devon Ops", country: "Germany", englishLevel: "C1", clientRate: 50, careerStartYear: 2015, totalYears: 10, updatedDaysAgo: 4, skills: [{ name: "Docker", years: 8 }, { name: "Kubernetes", years: 6 }, { name: "AWS", years: 8 }, { name: "Microservices", years: 5 }], matches: ["C"] },
  { key: "C2", name: "Kuba Cloud", country: "Poland", englishLevel: "B2+", clientRate: 45, careerStartYear: 2017, totalYears: 8, updatedDaysAgo: 18, skills: [{ name: "Docker", years: 6 }, { name: "Kubernetes", years: 4 }, { name: "AWS", years: 5 }], matches: ["C"] },
  // Backend infra but NO Kubernetes — misses a required skill.
  { key: "C3", name: "Bart Infra", country: "Czechia", englishLevel: "B2", clientRate: 42, careerStartYear: 2016, totalYears: 9, updatedDaysAgo: 25, skills: [{ name: "Docker", years: 6 }, { name: "AWS", years: 6 }, { name: "Redis", years: 5 }], matches: [] },

  // ---- Scenario D: Full Stack SaaS ----
  { key: "D1", name: "Fiona Stack", country: "Argentina", englishLevel: "B2+", clientRate: 34, careerStartYear: 2017, totalYears: 8, updatedDaysAgo: 3, skills: [{ name: "React", years: 7 }, { name: "Node.js", years: 7 }, { name: "PostgreSQL", years: 5 }, { name: "SaaS", years: 4 }], matches: ["D"] },
  { key: "D2", name: "Dario Full", country: "Poland", englishLevel: "B2", clientRate: 30, careerStartYear: 2019, totalYears: 6, updatedDaysAgo: 9, skills: [{ name: "React", years: 5 }, { name: "Node.js", years: 6 }, { name: "PostgreSQL", years: 4 }], matches: ["D"] },
  // Crossover: strong React + TS + Node + Postgres → matches both B and D.
  { key: "BD1", name: "Cross Over", country: "Romania", englishLevel: "C1", clientRate: 43, careerStartYear: 2015, totalYears: 10, updatedDaysAgo: 6, skills: [{ name: "React", years: 8 }, { name: "TypeScript", years: 6 }, { name: "Node.js", years: 7 }, { name: "PostgreSQL", years: 5 }, { name: "SaaS", years: 4 }], matches: ["B", "D"] },

  // ---- Distractors (no scenario) ----
  { key: "X1", name: "Della Design", country: "Romania", englishLevel: "C1", clientRate: 36, careerStartYear: 2018, totalYears: 7, updatedDaysAgo: 8, skills: [{ name: "Figma", years: 6 }, { name: "Design Systems", years: 4 }], matches: [] },
  { key: "X2", name: "Manny Mobile", country: "Spain", englishLevel: "B2", clientRate: 35, careerStartYear: 2018, totalYears: 7, updatedDaysAgo: 12, skills: [{ name: "Java", years: 6 }, { name: "Go", years: 3 }], matches: [] },

  // ---- Anomaly-planted (should be flagged + ranked down) ----
  { key: "AN1", name: "Impossible React", country: "Ukraine", englishLevel: "B2", clientRate: 33, careerStartYear: 2017, totalYears: 9, updatedDaysAgo: 12, skills: [{ name: "React", years: 16 }, { name: "TypeScript", years: 12 }, { name: "Node.js", years: 9 }], matches: [], planted: "impossible_tenure" },
  { key: "AN2", name: "Overlap Owen", country: "Poland", englishLevel: "B2", clientRate: 31, careerStartYear: 2018, totalYears: 7, updatedDaysAgo: 15, skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 6 }, { name: "PostgreSQL", years: 4 }], employments: [{ company: "Alpha", fullTime: true, start: [2022, 1] }, { company: "Beta", fullTime: true, start: [2021, 6] }], matches: [], planted: "overlap" },
  { key: "AN3", name: "Title Inflate", country: "Poland", englishLevel: "B2", clientRate: 28, careerStartYear: 2025, totalYears: 1, title: "Senior Software Architect", linkedinTitle: "Junior Developer", updatedDaysAgo: 9, skills: [{ name: "React", years: 1 }, { name: "Node.js", years: 1 }], matches: [], planted: "title_vs_experience" },
  { key: "AN4", name: "Dupe Primary", country: "Ukraine", englishLevel: "B2", clientRate: 32, careerStartYear: 2018, totalYears: 7, updatedDaysAgo: 11, email: "dupe@bench.example", skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 6 }, { name: "PostgreSQL", years: 4 }], matches: [], planted: "duplicate" },
  { key: "AN5", name: "Dupe Secondary", country: "Ukraine", englishLevel: "B2", clientRate: 32, careerStartYear: 2018, totalYears: 7, updatedDaysAgo: 11, email: "dupe@bench.example", skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 6 }, { name: "PostgreSQL", years: 4 }], matches: [], planted: "duplicate" },

  // ---- Freshness / availability edge cases ----
  { key: "ST1", name: "Stale Sam", country: "Bulgaria", englishLevel: "B2", clientRate: 30, careerStartYear: 2017, totalYears: 8, updatedDaysAgo: 400, skills: [{ name: "React", years: 6 }, { name: "Node.js", years: 6 }, { name: "PostgreSQL", years: 5 }, { name: "SaaS", years: 3 }], matches: ["D"], planted: "stale" },
  { key: "PL1", name: "Placed Polly", country: "Czechia", englishLevel: "C1", clientRate: 40, availability: "placed", careerStartYear: 2015, totalYears: 10, updatedDaysAgo: 30, skills: [{ name: "React", years: 8 }, { name: "Node.js", years: 8 }, { name: "PostgreSQL", years: 6 }, { name: "SaaS", years: 5 }], matches: [], planted: "placed_excluded" },
];
