import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Several suites are exhaustive combinatorial sweeps (every rule subset, every bounded
    // document up to N swept characters, every span boundary); their size is intentional and
    // release-blocking, since idempotency is a hard invariant rather than a sampled one. The
    // slowest legitimate case measured 10.0s on a shared GitHub Actions runner, so 30s is roughly
    // 3x headroom over observed worst case while still surfacing a genuine hang quickly. Vitest's
    // generic 5000ms default was never a project choice.
    testTimeout: 30_000,
  },
});
