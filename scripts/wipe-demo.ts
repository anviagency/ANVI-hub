/**
 * Wipe all demo/domain data so the system holds only real, imported data.
 * Keeps: users (auth/login) and the skill taxonomy. Removes: candidates, jobs,
 * clients, pipelines, notes, interviews, submissions, share links, analyses,
 * events, notifications, import batches, WhatsApp/webhook logs, background jobs.
 *
 *   npx tsx scripts/wipe-demo.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Wiping demo / domain data (keeping users + skills)…");

  // FK-safe order: children → parents.
  const steps: [string, () => Promise<{ count: number }>][] = [
    ["share link candidates", () => prisma.shareLinkCandidate.deleteMany()],
    ["share links", () => prisma.shareLink.deleteMany()],
    ["notifications", () => prisma.notification.deleteMany()],
    ["notes", () => prisma.note.deleteMany()],
    ["pipeline entries", () => prisma.pipeline.deleteMany()],
    ["candidate analyses", () => prisma.candidateAnalysis.deleteMany()],
    ["submissions", () => prisma.submission.deleteMany()],
    ["interviews", () => prisma.interview.deleteMany()],
    ["candidate events", () => prisma.candidateEvent.deleteMany()],
    ["placements", () => prisma.placement.deleteMany()],
    ["candidate skills", () => prisma.candidateSkill.deleteMany()],
    ["employments", () => prisma.employment.deleteMany()],
    ["job skills", () => prisma.jobSkill.deleteMany()],
    ["jobs", () => prisma.job.deleteMany()],
    ["candidates", () => prisma.candidate.deleteMany()],
    ["import batches", () => prisma.importBatch.deleteMany()],
    ["clients", () => prisma.client.deleteMany()],
    ["background jobs", () => prisma.backgroundJob.deleteMany()],
  ];

  // Optional logs (present only in later migrations).
  const optional: [string, () => Promise<{ count: number }>][] = [
    ["whatsapp messages", () => prisma.waMessage.deleteMany()],
    ["webhook events", () => prisma.webhookEvent.deleteMany()],
  ];

  for (const [label, fn] of steps) {
    const { count } = await fn();
    console.log(`  ✓ ${label}: ${count}`);
  }
  for (const [label, fn] of optional) {
    try {
      const { count } = await fn();
      console.log(`  ✓ ${label}: ${count}`);
    } catch { /* table may not exist in this schema version */ }
  }

  // Detach client users from now-deleted clients so login still works.
  await prisma.user.updateMany({ where: { clientId: { not: null } }, data: { clientId: null } });

  const users = await prisma.user.count();
  const skills = await prisma.skill.count();
  const candidates = await prisma.candidate.count();
  console.log(`\n✅ Done. Remaining: ${users} users, ${skills} skills, ${candidates} candidates (real data only).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
