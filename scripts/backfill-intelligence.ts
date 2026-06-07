/**
 * Backfill Candidate Intelligence (Mission 10 Phase 2) for every existing
 * candidate that doesn't yet have an intelligence object. Idempotent — safe to
 * re-run. Uses the deterministic fallback when no AI provider is configured.
 *
 *   npx tsx scripts/backfill-intelligence.ts
 */
import { prisma } from "../src/lib/db";
import { upsertCandidateIntelligence } from "../src/lib/ai/candidate-intelligence";

async function main() {
  const candidates = await prisma.candidate.findMany({
    where: { deletedAt: null, intelligence: null },
    select: { id: true, fullName: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Backfilling intelligence for ${candidates.length} candidate(s)…`);
  let ok = 0;
  for (const c of candidates) {
    try {
      const done = await upsertCandidateIntelligence(c.id);
      if (done) ok++;
      console.log(`  ${done ? "✓" : "·"} ${c.fullName}`);
    } catch (e) {
      console.error(`  ✗ ${c.fullName}: ${(e as Error).message}`);
    }
  }
  console.log(`Done — ${ok}/${candidates.length} intelligence objects built.`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
