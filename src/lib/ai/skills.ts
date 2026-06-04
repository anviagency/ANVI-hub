// Skill catalog — canonical names, synonyms, and public release years.
// Kept as data (spec §15: "maintain the skill-release-year table and rule set
// as data, not hardcoded — it's a living asset"). The seed script loads this
// into the `skill` table; the parser and anomaly engine read from it.

export interface SkillDef {
  canonical: string;
  synonyms: string[];
  releaseYear?: number;
}

export const SKILL_CATALOG: SkillDef[] = [
  { canonical: "JavaScript", synonyms: ["js", "javascript", "ecmascript", "es6"], releaseYear: 1995 },
  { canonical: "TypeScript", synonyms: ["ts", "typescript"], releaseYear: 2012 },
  { canonical: "React", synonyms: ["react", "react.js", "reactjs"], releaseYear: 2013 },
  { canonical: "Next.js", synonyms: ["next", "nextjs", "next.js"], releaseYear: 2016 },
  { canonical: "Node.js", synonyms: ["node", "nodejs", "node.js"], releaseYear: 2009 },
  { canonical: "Express", synonyms: ["express", "express.js", "expressjs"], releaseYear: 2010 },
  { canonical: "Python", synonyms: ["python", "py"], releaseYear: 1991 },
  { canonical: "FastAPI", synonyms: ["fastapi", "fast api"], releaseYear: 2018 },
  { canonical: "Django", synonyms: ["django"], releaseYear: 2005 },
  { canonical: "PostgreSQL", synonyms: ["postgres", "postgresql", "psql", "pg"], releaseYear: 1996 },
  { canonical: "MongoDB", synonyms: ["mongo", "mongodb"], releaseYear: 2009 },
  { canonical: "Redis", synonyms: ["redis"], releaseYear: 2009 },
  { canonical: "GraphQL", synonyms: ["graphql", "gql"], releaseYear: 2015 },
  { canonical: "REST", synonyms: ["rest", "rest api", "restful"], releaseYear: 2000 },
  { canonical: "AWS", synonyms: ["aws", "amazon web services"], releaseYear: 2006 },
  { canonical: "Docker", synonyms: ["docker"], releaseYear: 2013 },
  { canonical: "Kubernetes", synonyms: ["kubernetes", "k8s"], releaseYear: 2014 },
  { canonical: "Microservices", synonyms: ["microservices", "microservice"] },
  { canonical: "SaaS", synonyms: ["saas"] },
  { canonical: "Tailwind", synonyms: ["tailwind", "tailwindcss"], releaseYear: 2017 },
  { canonical: "PyTorch", synonyms: ["pytorch", "torch"], releaseYear: 2016 },
  { canonical: "TensorFlow", synonyms: ["tensorflow", "tf"], releaseYear: 2015 },
  { canonical: "RAG", synonyms: ["rag", "retrieval augmented generation"], releaseYear: 2020 },
  { canonical: "LangChain", synonyms: ["langchain"], releaseYear: 2022 },
  { canonical: "pgvector", synonyms: ["pgvector"], releaseYear: 2021 },
  { canonical: "LLM", synonyms: ["llm", "llms", "large language model"], releaseYear: 2020 },
  { canonical: "Airflow", synonyms: ["airflow", "apache airflow"], releaseYear: 2015 },
  { canonical: "Figma", synonyms: ["figma"], releaseYear: 2016 },
  { canonical: "Design Systems", synonyms: ["design systems", "design system"] },
  { canonical: "Prototyping", synonyms: ["prototyping", "prototype"] },
  { canonical: "UX Research", synonyms: ["ux research", "user research", "ux"] },
  { canonical: "Go", synonyms: ["golang", "go lang"], releaseYear: 2009 },
  { canonical: "Rust", synonyms: ["rust"], releaseYear: 2015 },
  { canonical: "Java", synonyms: ["java"], releaseYear: 1995 },
  { canonical: "C#", synonyms: ["c#", "csharp", ".net", "dotnet"], releaseYear: 2000 },
];

// Build a lookup from any synonym (lowercased) -> canonical name.
const SYNONYM_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const s of SKILL_CATALOG) {
    m.set(s.canonical.toLowerCase(), s.canonical);
    for (const syn of s.synonyms) m.set(syn.toLowerCase(), s.canonical);
  }
  return m;
})();

const RELEASE_YEAR_INDEX: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (const s of SKILL_CATALOG) {
    if (s.releaseYear) m.set(s.canonical, s.releaseYear);
  }
  return m;
})();

/** Resolve any skill token (e.g. "JS", "react.js") to its canonical name, or null. */
export function canonicalizeSkill(token: string): string | null {
  return SYNONYM_INDEX.get(token.trim().toLowerCase()) ?? null;
}

export function skillReleaseYear(canonical: string): number | undefined {
  return RELEASE_YEAR_INDEX.get(canonical);
}

/** Scan free text and return the set of canonical skills mentioned. */
export function extractSkillsFromText(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const s of SKILL_CATALOG) {
    const tokens = [s.canonical, ...s.synonyms];
    for (const tok of tokens) {
      // Word-boundary-ish match. Escape regex specials in the token.
      const escaped = tok.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`, "i");
      if (re.test(lower)) {
        found.add(s.canonical);
        break;
      }
    }
  }
  return [...found];
}
