/**
 * List the Gemini models available to the configured GEMINI_API_KEY and flag the
 * strongest ones for text generation. Run after adding the key to .env:
 *   npx tsx scripts/gemini-models.ts
 */
const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();

async function main() {
  if (!key) {
    console.error("No GEMINI_API_KEY in env. Add it to .env first.");
    process.exit(1);
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`);
  if (!res.ok) {
    console.error("ListModels failed:", res.status, (await res.text()).slice(0, 300));
    process.exit(1);
  }
  const data = (await res.json()) as {
    models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  };
  const gen = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));

  console.log("\nGenerateContent-capable Gemini models for your key:\n");
  for (const m of gen) console.log("  •", m);

  // Rank: prefer highest version, then pro > flash, then non-preview.
  const score = (id: string) => {
    const v = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1]) ?? "0");
    const pro = /pro/.test(id) ? 1 : 0;
    const stable = /preview|exp|latest/.test(id) ? 0 : 1;
    return v * 100 + pro * 10 + stable;
  };
  const best = [...gen].sort((a, b) => score(b) - score(a))[0];
  const bestFlash = [...gen].filter((m) => /flash/.test(m)).sort((a, b) => score(b) - score(a))[0];

  console.log("\n➡  Strongest (set GEMINI_MODEL_DEEP):", best ?? "(none)");
  console.log("➡  Fast/cheap (set GEMINI_MODEL):    ", bestFlash ?? best ?? "(none)");
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
