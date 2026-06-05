import { PrismaClient, Availability } from "@prisma/client";
import { SKILL_CATALOG } from "../src/lib/ai/skills";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function ym(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

interface SeedEmployment {
  company: string;
  title: string;
  fullTime?: boolean;
  start: [number, number]; // [year, month]
  end?: [number, number] | null; // null/omitted = current
}

interface SeedCandidate {
  fullName: string;
  title: string;
  country: string;
  location: string;
  flag: string;
  englishLevel: string;
  totalYears: number;
  careerStartYear: number;
  availability: Availability;
  availabilityNote?: string;
  clientRate: number;
  salaryExpectation: number;
  source: string;
  linkedinTitle?: string;
  updatedDaysAgo: number;
  aiSummary: string;
  skills: { name: string; years: number }[];
  employments: SeedEmployment[];
}

const CANDIDATES: SeedCandidate[] = [
  // ---- Strong, clean full-stack candidates ----
  {
    fullName: "Artem Valkov",
    title: "Senior Full-Stack Developer",
    country: "Ukraine",
    location: "Kyiv",
    flag: "🇺🇦",
    englishLevel: "B2+",
    totalYears: 7,
    careerStartYear: 2018,
    availability: "available",
    availabilityNote: "2 weeks",
    clientRate: 34,
    salaryExpectation: 24,
    source: "Telegram",
    updatedDaysAgo: 3,
    aiSummary:
      "Senior full-stack engineer with 7+ years across React/Next.js front-ends and Node/Express back-ends on B2B SaaS.",
    skills: [
      { name: "React", years: 6 },
      { name: "Next.js", years: 5 },
      { name: "Node.js", years: 7 },
      { name: "Express", years: 6 },
      { name: "PostgreSQL", years: 5 },
      { name: "TypeScript", years: 6 },
      { name: "SaaS", years: 5 },
    ],
    employments: [
      { company: "Northbridge SaaS", title: "Senior Full-Stack Developer", start: [2021, 3] },
      { company: "Kyiv Web Studio", title: "Full-Stack Developer", start: [2018, 6], end: [2021, 2] },
    ],
  },
  {
    fullName: "Oleksandr Hrytsenko",
    title: "Senior Software Engineer",
    country: "Ukraine",
    location: "Lviv",
    flag: "🇺🇦",
    englishLevel: "C1",
    totalYears: 8,
    careerStartYear: 2017,
    availability: "available",
    availabilityNote: "1 month",
    clientRate: 38,
    salaryExpectation: 27,
    source: "LinkedIn",
    updatedDaysAgo: 8,
    aiSummary: "Senior engineer, 8 years, C1 English, strong across the stack with AWS and GraphQL.",
    skills: [
      { name: "React", years: 6 },
      { name: "Next.js", years: 4 },
      { name: "Node.js", years: 8 },
      { name: "GraphQL", years: 4 },
      { name: "PostgreSQL", years: 7 },
      { name: "AWS", years: 6 },
      { name: "SaaS", years: 5 },
    ],
    employments: [
      { company: "Globe Logistics", title: "Senior Software Engineer", start: [2020, 1] },
      { company: "Lviv Devhouse", title: "Software Engineer", start: [2017, 9], end: [2019, 12] },
    ],
  },
  {
    fullName: "Sofia Marin",
    title: "Frontend-leaning Full-Stack Dev",
    country: "Argentina",
    location: "Buenos Aires",
    flag: "🇦🇷",
    englishLevel: "B2+",
    totalYears: 6,
    careerStartYear: 2019,
    availability: "available",
    availabilityNote: "3 weeks",
    clientRate: 32,
    salaryExpectation: 22,
    source: "Telegram",
    updatedDaysAgo: 12,
    aiSummary: "Frontend-leaning full-stack with strong product sense and Next.js depth. LATAM timezone.",
    skills: [
      { name: "React", years: 6 },
      { name: "Next.js", years: 4 },
      { name: "TypeScript", years: 5 },
      { name: "Tailwind", years: 4 },
      { name: "Node.js", years: 4 },
      { name: "SaaS", years: 3 },
    ],
    employments: [
      { company: "Pampa Apps", title: "Full-Stack Developer", start: [2021, 5] },
      { company: "BA Studio", title: "Frontend Developer", start: [2019, 2], end: [2021, 4] },
    ],
  },
  {
    fullName: "Dmytro Koval",
    title: "Full-Stack Engineer",
    country: "Poland",
    location: "Wrocław",
    flag: "🇵🇱",
    englishLevel: "B2",
    totalYears: 5,
    careerStartYear: 2020,
    availability: "available",
    availabilityNote: "Immediate",
    clientRate: 29,
    salaryExpectation: 20,
    source: "Excel import",
    updatedDaysAgo: 20,
    aiSummary: "Pragmatic full-stack dev, 5 years, ships fast. Strong React + Node, lighter on Postgres.",
    skills: [
      { name: "React", years: 5 },
      { name: "Node.js", years: 5 },
      { name: "Express", years: 4 },
      { name: "MongoDB", years: 4 },
      { name: "Next.js", years: 3 },
      { name: "REST", years: 5 },
    ],
    employments: [
      { company: "Wroc Software", title: "Full-Stack Engineer", start: [2022, 1] },
      { company: "Startup Foundry", title: "Junior Developer", start: [2020, 3], end: [2021, 12] },
    ],
  },
  {
    fullName: "Pavel Novak",
    title: "Backend Engineer",
    country: "Czechia",
    location: "Brno",
    flag: "🇨🇿",
    englishLevel: "B2",
    totalYears: 9,
    careerStartYear: 2016,
    availability: "available",
    availabilityNote: "1 month",
    clientRate: 36,
    salaryExpectation: 26,
    source: "Excel import",
    updatedDaysAgo: 40,
    aiSummary: "Backend specialist, 9 years, infra-strong. Lighter on modern front-end.",
    skills: [
      { name: "Node.js", years: 9 },
      { name: "Express", years: 7 },
      { name: "PostgreSQL", years: 8 },
      { name: "Redis", years: 6 },
      { name: "Docker", years: 6 },
      { name: "Microservices", years: 5 },
    ],
    employments: [
      { company: "Brno Systems", title: "Backend Engineer", start: [2019, 6] },
      { company: "CZ Telecom", title: "Software Developer", start: [2016, 4], end: [2019, 5] },
    ],
  },
  // ---- ML candidates ----
  {
    fullName: "Mira Antonova",
    title: "ML Engineer",
    country: "Estonia",
    location: "Tallinn",
    flag: "🇪🇪",
    englishLevel: "C1",
    totalYears: 6,
    careerStartYear: 2019,
    availability: "available",
    availabilityNote: "2 weeks",
    clientRate: 54,
    salaryExpectation: 38,
    source: "LinkedIn",
    updatedDaysAgo: 5,
    aiSummary: "ML engineer with production RAG and eval pipeline experience. C1 English.",
    skills: [
      { name: "Python", years: 6 },
      { name: "PyTorch", years: 5 },
      { name: "RAG", years: 3 },
      { name: "LangChain", years: 2 },
      { name: "pgvector", years: 2 },
      { name: "FastAPI", years: 4 },
    ],
    employments: [
      { company: "Baltic AI", title: "ML Engineer", start: [2021, 2] },
      { company: "Tallinn Data Co", title: "Data Scientist", start: [2019, 1], end: [2021, 1] },
    ],
  },
  {
    fullName: "Yuki Tanaka",
    title: "ML / Data Engineer",
    country: "Portugal",
    location: "Lisbon",
    flag: "🇵🇹",
    englishLevel: "B2+",
    totalYears: 5,
    careerStartYear: 2020,
    availability: "available",
    availabilityNote: "Immediate",
    clientRate: 47,
    salaryExpectation: 33,
    source: "Telegram",
    updatedDaysAgo: 30,
    aiSummary: "Data-leaning ML engineer with RAG and pipeline experience. Available immediately.",
    skills: [
      { name: "Python", years: 5 },
      { name: "FastAPI", years: 4 },
      { name: "RAG", years: 2 },
      { name: "Airflow", years: 3 },
    ],
    employments: [
      { company: "Iberia ML", title: "ML / Data Engineer", start: [2021, 6] },
      { company: "Lisbon Analytics", title: "Data Engineer", start: [2020, 1], end: [2021, 5] },
    ],
  },
  // ---- Designer ----
  {
    fullName: "Elena Costa",
    title: "Product Designer",
    country: "Romania",
    location: "Cluj",
    flag: "🇷🇴",
    englishLevel: "C1",
    totalYears: 6,
    careerStartYear: 2019,
    availability: "available",
    availabilityNote: "2 weeks",
    clientRate: 36,
    salaryExpectation: 25,
    source: "LinkedIn",
    updatedDaysAgo: 6,
    aiSummary: "Senior product designer with B2B fintech depth and strong systems thinking.",
    skills: [
      { name: "Figma", years: 6 },
      { name: "Design Systems", years: 4 },
      { name: "Prototyping", years: 5 },
      { name: "UX Research", years: 4 },
    ],
    employments: [
      { company: "Cluj Fintech", title: "Product Designer", start: [2021, 3] },
      { company: "Design Lab RO", title: "UI Designer", start: [2019, 2], end: [2021, 2] },
    ],
  },

  // ===================== ANOMALY CASES =====================
  {
    // Rule 1 + 2: impossible React tenure + skill > career.
    fullName: "Roman Bilyk",
    title: "Senior Full-Stack Developer",
    country: "Ukraine",
    location: "Odesa",
    flag: "🇺🇦",
    englishLevel: "B2",
    totalYears: 8,
    careerStartYear: 2017,
    availability: "available",
    availabilityNote: "Immediate",
    clientRate: 31,
    salaryExpectation: 22,
    source: "Excel import",
    updatedDaysAgo: 15,
    aiSummary: "Claims very deep React/Next.js experience — figures do not add up on inspection.",
    skills: [
      { name: "React", years: 15 }, // React released 2013 → impossible in 2026
      { name: "Next.js", years: 12 }, // released 2016 → impossible
      { name: "Node.js", years: 9 },
      { name: "PostgreSQL", years: 4 },
      { name: "Express", years: 5 },
    ],
    employments: [
      { company: "Odesa Web", title: "Senior Full-Stack Developer", start: [2020, 1] },
      { company: "Freelance", title: "Developer", start: [2017, 1], end: [2019, 12] },
    ],
  },
  {
    // Rule 3: overlapping full-time employment.
    fullName: "Bogdan Marchenko",
    title: "Full-Stack Engineer",
    country: "Ukraine",
    location: "Kharkiv",
    flag: "🇺🇦",
    englishLevel: "B2",
    totalYears: 6,
    careerStartYear: 2019,
    availability: "available",
    availabilityNote: "2 weeks",
    clientRate: 30,
    salaryExpectation: 21,
    source: "Telegram",
    updatedDaysAgo: 18,
    aiSummary: "Solid full-stack profile, but two full-time roles appear to run at the same time.",
    skills: [
      { name: "React", years: 5 },
      { name: "Node.js", years: 6 },
      { name: "Express", years: 5 },
      { name: "PostgreSQL", years: 4 },
      { name: "Next.js", years: 3 },
    ],
    employments: [
      { company: "Alpha Corp", title: "Full-Stack Engineer", fullTime: true, start: [2022, 1] }, // current
      { company: "Beta Labs", title: "Backend Engineer", fullTime: true, start: [2021, 6] }, // overlaps Alpha
    ],
  },
  {
    // Rule 4: senior/architect title vs ~1 year experience.
    fullName: "Nikita Sorokin",
    title: "Senior Software Architect",
    country: "Poland",
    location: "Kraków",
    flag: "🇵🇱",
    englishLevel: "B2",
    totalYears: 1,
    careerStartYear: 2025,
    availability: "available",
    availabilityNote: "Immediate",
    clientRate: 28,
    salaryExpectation: 19,
    source: "LinkedIn",
    linkedinTitle: "Junior Developer",
    updatedDaysAgo: 10,
    aiSummary: "Self-described Senior Architect; total experience and LinkedIn title both contradict it.",
    skills: [
      { name: "React", years: 1 },
      { name: "Node.js", years: 1 },
      { name: "JavaScript", years: 1 },
    ],
    employments: [
      { company: "Kraków Startup", title: "Junior Developer", start: [2025, 1] },
    ],
  },
  {
    // Rule 6: 14-month unexplained gap.
    fullName: "Iryna Tkachuk",
    title: "Full-Stack Developer",
    country: "Ukraine",
    location: "Dnipro",
    flag: "🇺🇦",
    englishLevel: "B2",
    totalYears: 7,
    careerStartYear: 2018,
    availability: "available",
    availabilityNote: "3 weeks",
    clientRate: 30,
    salaryExpectation: 21,
    source: "Excel import",
    updatedDaysAgo: 25,
    aiSummary: "Capable full-stack engineer with a notable unexplained gap between roles.",
    skills: [
      { name: "React", years: 6 },
      { name: "Node.js", years: 6 },
      { name: "Express", years: 5 },
      { name: "PostgreSQL", years: 5 },
      { name: "Next.js", years: 3 },
    ],
    employments: [
      { company: "Dnipro Tech", title: "Full-Stack Developer", start: [2022, 3] },
      // 14-month gap before this (prev ended 2021-01)
      { company: "East Web", title: "Developer", start: [2018, 6], end: [2021, 1] },
    ],
  },
  {
    // Over budget + currently placed (availability filter + risk).
    fullName: "Marek Dvorak",
    title: "Senior Full-Stack Developer",
    country: "Czechia",
    location: "Prague",
    flag: "🇨🇿",
    englishLevel: "C1",
    totalYears: 10,
    careerStartYear: 2015,
    availability: "placed",
    availabilityNote: "On a placement",
    clientRate: 58,
    salaryExpectation: 42,
    source: "LinkedIn",
    updatedDaysAgo: 60,
    aiSummary: "Excellent senior engineer but currently on a placement and above the budget band.",
    skills: [
      { name: "React", years: 8 },
      { name: "Node.js", years: 9 },
      { name: "PostgreSQL", years: 8 },
      { name: "AWS", years: 6 },
      { name: "Next.js", years: 5 },
    ],
    employments: [{ company: "Prague Cloud", title: "Senior Full-Stack Developer", start: [2018, 1] }],
  },
  {
    // Stale profile (updated ~2 years ago) — recency penalty + risk.
    fullName: "Anna Petrova",
    title: "Full-Stack Developer",
    country: "Bulgaria",
    location: "Sofia",
    flag: "🇧🇬",
    englishLevel: "B2",
    totalYears: 6,
    careerStartYear: 2018,
    availability: "available",
    availabilityNote: "Unknown",
    clientRate: 27,
    salaryExpectation: 19,
    source: "Excel import",
    updatedDaysAgo: 760,
    aiSummary: "Profile has not been touched in ~2 years — currency must be verified before submitting.",
    skills: [
      { name: "React", years: 5 },
      { name: "Node.js", years: 5 },
      { name: "Express", years: 4 },
      { name: "PostgreSQL", years: 4 },
    ],
    employments: [
      { company: "Sofia Soft", title: "Full-Stack Developer", start: [2020, 1], end: [2023, 6] },
      { company: "BG Web", title: "Developer", start: [2018, 1], end: [2019, 12] },
    ],
  },
];

async function main() {
  console.log("⏳ Seeding ANVI database…");

  // Clear (respect FK order).
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.user.deleteMany();
  await prisma.shareLinkCandidate.deleteMany();
  await prisma.shareLink.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.note.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.candidateAnalysis.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.candidateEvent.deleteMany();
  await prisma.placement.deleteMany();
  await prisma.candidateSkill.deleteMany();
  await prisma.employment.deleteMany();
  await prisma.jobSkill.deleteMany();
  await prisma.job.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.client.deleteMany();
  await prisma.skill.deleteMany();

  // Skills.
  for (const s of SKILL_CATALOG) {
    await prisma.skill.create({
      data: { canonicalName: s.canonical, synonyms: s.synonyms, releaseYear: s.releaseYear ?? null },
    });
  }
  const skillByName = new Map(
    (await prisma.skill.findMany()).map((s) => [s.canonicalName, s.id])
  );
  console.log(`  ✓ ${skillByName.size} skills`);

  // Users (always — needed for login). Dev passwords — change in production.
  await prisma.user.create({ data: { email: "admin@anvi.com", name: "ANVI Admin", role: "admin", passwordHash: await hashPassword("admin1234") } });
  await prisma.user.create({ data: { email: "daria@anvi.com", name: "Daria Levin", role: "recruiter", passwordHash: await hashPassword("recruiter1234") } });
  console.log("  ✓ users: admin@anvi.com / daria@anvi.com");

  // Demo domain data only when SEED_DEMO=1 — otherwise the system holds real data only.
  if (process.env.SEED_DEMO !== "1") {
    console.log("  (real-data mode — skipping demo clients/candidates/jobs; set SEED_DEMO=1 for the demo dataset)");
    console.log("✅ Seed complete (users + skills).");
    return;
  }

  // Clients.
  const andy = await prisma.client.create({
    data: {
      name: "Andy Kessler",
      company: "Northwind SaaS",
      initials: "AK",
      country: "United States",
      tz: "PST",
      email: "andy@northwind.example",
      whatsappNumber: "+10000000001",
      portalSlug: "andy-northwind",
    },
  });
  const lena = await prisma.client.create({
    data: {
      name: "Lena Brandt",
      company: "Vektor Labs",
      initials: "LB",
      country: "Germany",
      tz: "CET",
      email: "lena@vektor.example",
      whatsappNumber: "+10000000002",
      portalSlug: "lena-vektor",
    },
  });
  const marco = await prisma.client.create({
    data: {
      name: "Marco Reyes",
      company: "Fintora",
      initials: "MR",
      country: "Spain",
      tz: "CET",
      email: "marco@fintora.example",
      whatsappNumber: "+10000000003",
      portalSlug: "marco-fintora",
    },
  });
  console.log("  ✓ 3 clients");

  // Demo client login user.
  await prisma.user.create({ data: { email: "andy@northwind.example", name: "Andy Kessler", role: "client", clientId: andy.id, passwordHash: await hashPassword("client1234") } });
  console.log("  ✓ demo client user (andy@northwind.example)");

  // Candidates.
  const candidateIdByName = new Map<string, string>();
  for (const c of CANDIDATES) {
    const created = await prisma.candidate.create({
      data: {
        fullName: c.fullName,
        // Dedupe key for re-imports (no seeded emails → name+country).
        dedupeKey: `name:${c.fullName.toLowerCase()}|${c.country.toLowerCase()}`,
        title: c.title,
        country: c.country,
        location: c.location,
        flag: c.flag,
        englishLevel: c.englishLevel,
        totalYears: c.totalYears,
        careerStartYear: c.careerStartYear,
        availability: c.availability,
        availabilityNote: c.availabilityNote,
        clientRate: c.clientRate,
        salaryExpectation: c.salaryExpectation,
        source: c.source,
        linkedinTitle: c.linkedinTitle,
        aiSummary: c.aiSummary,
        updatedAt: daysAgo(c.updatedDaysAgo),
        lastContactedAt: daysAgo(Math.min(c.updatedDaysAgo, 7)),
        skills: {
          create: c.skills
            .filter((s) => skillByName.has(s.name))
            .map((s) => ({ skillId: skillByName.get(s.name)!, years: s.years })),
        },
        employments: {
          create: c.employments.map((e) => ({
            company: e.company,
            title: e.title,
            fullTime: e.fullTime ?? true,
            startDate: ym(e.start[0], e.start[1]),
            endDate: e.end ? ym(e.end[0], e.end[1]) : null,
          })),
        },
      },
    });
    candidateIdByName.set(c.fullName, created.id);
  }
  console.log(`  ✓ ${CANDIDATES.length} candidates (incl. anomaly cases)`);

  // Jobs (pre-created so list views + matching have something on first load).
  const reqSkill = (name: string, required: boolean, minYears: number | null) => ({
    required,
    minYears,
    skill: { connect: { id: skillByName.get(name)! } },
  });

  const fullStackJob = await prisma.job.create({
    data: {
      clientId: andy.id,
      title: "Senior Full-Stack Developer",
      seniority: "Senior",
      budgetMin: 28,
      budgetMax: 42,
      budgetUnit: "usd_hour",
      englishLevel: "B2+",
      experienceYearsMin: 5,
      descriptionRaw:
        "Need Senior Full-Stack Developer\n5+ years\nReact, Next.js, Node.js, Express, PostgreSQL\nSaaS\nB2+ English\nBudget $28-42/hour",
      skills: {
        create: [
          reqSkill("React", true, 4),
          reqSkill("Next.js", true, 2),
          reqSkill("Node.js", true, 3),
          reqSkill("Express", true, null),
          reqSkill("PostgreSQL", true, 2),
          reqSkill("SaaS", false, null),
          reqSkill("TypeScript", false, null),
        ],
      },
    },
  });

  await prisma.job.create({
    data: {
      clientId: lena.id,
      title: "ML Engineer (LLM / RAG)",
      seniority: "Senior",
      budgetMin: 45,
      budgetMax: 65,
      budgetUnit: "usd_hour",
      englishLevel: "C1",
      experienceYearsMin: 5,
      descriptionRaw:
        "ML Engineer\nPython, PyTorch, RAG, LangChain, pgvector, FastAPI\n5+ years\nC1 English\n$45-65/hour",
      skills: {
        create: [
          reqSkill("Python", true, 4),
          reqSkill("RAG", true, 1),
          reqSkill("FastAPI", true, null),
          reqSkill("PyTorch", false, null),
          reqSkill("LangChain", false, null),
          reqSkill("pgvector", false, null),
        ],
      },
    },
  });

  await prisma.job.create({
    data: {
      clientId: marco.id,
      title: "Product Designer (B2B)",
      seniority: "Middle+",
      budgetMin: 30,
      budgetMax: 45,
      budgetUnit: "usd_hour",
      englishLevel: "B2+",
      experienceYearsMin: 4,
      descriptionRaw: "Product Designer\nFigma, Design Systems, Prototyping, UX Research\nB2B\n$30-45/hour",
      skills: {
        create: [
          reqSkill("Figma", true, 3),
          reqSkill("Design Systems", true, null),
          reqSkill("Prototyping", false, null),
          reqSkill("UX Research", false, null),
        ],
      },
    },
  });

  void marco;
  console.log("  ✓ 3 jobs");

  // Pipeline entries for the Full-Stack role (gives the board + share link data).
  const stageByName: [string, "new" | "screened" | "sent_to_client" | "interview"][] = [
    ["Artem Valkov", "sent_to_client"],
    ["Oleksandr Hrytsenko", "interview"],
    ["Sofia Marin", "screened"],
    ["Dmytro Koval", "new"],
    ["Iryna Tkachuk", "screened"],
  ];
  for (const [name, stage] of stageByName) {
    const cid = candidateIdByName.get(name);
    if (!cid) continue;
    await prisma.pipeline.create({
      data: { candidateId: cid, jobId: fullStackJob.id, stage },
    });
    await prisma.candidateEvent.create({
      data: { candidateId: cid, jobId: fullStackJob.id, type: "stage_changed", actor: "recruiter", meta: { to: stage } },
    });
  }

  // A couple of notes + a communication entry on Artem.
  const artemId = candidateIdByName.get("Artem Valkov");
  if (artemId) {
    await prisma.note.createMany({
      data: [
        { candidateId: artemId, jobId: fullStackJob.id, kind: "note", body: "Strong on Next.js. Probe system-design depth in client interview.", internal: true, author: "Daria" },
        { candidateId: artemId, jobId: fullStackJob.id, kind: "call", body: "Intro call done — confident communicator, 2-week notice confirmed.", internal: false, author: "Daria" },
      ],
    });
    // Submission so the client view has a decision state.
    await prisma.submission.upsert({
      where: { jobId_candidateId: { jobId: fullStackJob.id, candidateId: artemId } },
      create: { clientId: andy.id, jobId: fullStackJob.id, candidateId: artemId, clientStatus: "pending" },
      update: {},
    });
  }

  // A demo client share link for the Full-Stack role (token is stable for demos).
  const oleksandrId = candidateIdByName.get("Oleksandr Hrytsenko");
  const share = await prisma.shareLink.create({
    data: {
      token: "demo-fullstack-share",
      jobId: fullStackJob.id,
      clientId: andy.id,
      label: "Top picks — Senior Full-Stack",
      candidates: {
        create: [
          ...(artemId ? [{ candidateId: artemId, shareNotes: true }] : []),
          ...(oleksandrId ? [{ candidateId: oleksandrId, shareNotes: false }] : []),
        ],
      },
    },
  });
  console.log(`  ✓ pipeline (${stageByName.length}) + share link /share/${share.token}`);
  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
