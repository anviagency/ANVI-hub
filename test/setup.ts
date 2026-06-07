// Test setup: load .env so the Prisma singleton has DATABASE_URL, and register
// Testing Library cleanup between component tests. Runs before each test file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";

// Minimal .env loader (no dotenv dependency).
try {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) process.env[key] = val;
  }
} catch {
  // .env optional; CI may provide DATABASE_URL directly.
}

// Hermetic AI: tests must NEVER call a real provider (slow, costly, non-deterministic).
// They exercise the deterministic engine; AI behavior is covered by mocked tests.
// This mirrors CI (no provider keys) regardless of what a local .env contains.
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
process.env.AI_AGENT = "0";

// Auto-cleanup the DOM after each component test (jsdom env only).
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
