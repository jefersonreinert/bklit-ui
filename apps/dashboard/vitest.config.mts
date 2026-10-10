import { defineConfig } from "vitest/config";

// Convex functions (convex/*.test.ts) run against convex-test's in-memory
// backend; the node:test suites in lib/ use `node --test` instead.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
