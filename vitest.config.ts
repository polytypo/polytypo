import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Kept at the same 30s the JS implementation (polytypo/polytypo-js) uses, a deliberate
    // project-wide choice rather than vitest's generic 5000ms default — see that repo's
    // vitest.config.ts for the original rationale (combinatorial idempotency sweeps, no longer
    // present here after the split).
    testTimeout: 30_000,
  },
});
