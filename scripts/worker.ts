/**
 * Background worker (Mission 3.5 P4). Drains the Postgres-backed job queue:
 * Telegram delivery, candidate imports, and AI analysis all run here, off the
 * request path. Run: npm run worker
 */
import { processJobs } from "../src/lib/queue/queue";
import { handlers } from "../src/lib/queue/handlers";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1000);
let running = true;

async function loop() {
  console.log("⚙️  ANVI worker started. Polling every", POLL_MS, "ms");
  while (running) {
    try {
      const n = await processJobs(handlers, 50);
      if (n > 0) console.log(`  processed ${n} job(s)`);
    } catch (e) {
      console.error("worker error:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on("SIGINT", () => {
  console.log("\nworker stopping…");
  running = false;
  setTimeout(() => process.exit(0), 200);
});

loop();
