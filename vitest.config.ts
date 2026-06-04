import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Component tests run in jsdom; everything else in node.
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    // Integration tests share one Postgres — run test files serially to avoid races.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
