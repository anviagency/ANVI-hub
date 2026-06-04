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

// Auto-cleanup the DOM after each component test (jsdom env only).
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
